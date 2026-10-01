import {
  type Row,
  type SelectQuery,
  type ServerGateway,
  ServerError,
} from '../../src/data/supabase/gateway';
import { type Session } from './harness';

/**
 * A stand-in for Supabase's HTTP API that talks straight to the test database, as one signed-in user.
 * It returns rows the way PostgREST does (JSON: numbers as numbers, timestamps as ISO text), so the
 * repository code under test sees what it will see in production.
 */

const IDENTIFIER = /^[a-z_]+$/;

function identifier(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`unsafe identifier: ${name}`);
  return name;
}

function asServerError(error: unknown): ServerError {
  const e = error as { code?: string; message?: string };
  return new ServerError(e.code ?? '', e.message ?? String(error), 400);
}

interface FunctionInfo {
  names: string[];
  types: string[];
  returnsSet: boolean;
  returns: string;
}

export function createPgliteGateway(session: Session): ServerGateway {
  const functions = new Map<string, FunctionInfo>();

  async function describeFunction(fn: string): Promise<FunctionInfo> {
    const cached = functions.get(fn);
    if (cached) return cached;
    const [row] = await session.query<{
      names: string[] | null;
      types: string[];
      returns_set: boolean;
      returns: string;
    }>(
      `select p.proargnames as names,
              (select coalesce(array_agg(t::regtype::text order by ord), '{}')
                 from unnest(p.proargtypes::oid[]) with ordinality as x(t, ord)) as types,
              p.proretset as returns_set, p.prorettype::regtype::text as returns
       from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`,
      [identifier(fn)],
    );
    if (!row) throw new ServerError('42883', `unknown function ${fn}`, 404);
    const info = {
      names: row.names ?? [],
      types: row.types,
      returnsSet: row.returns_set,
      returns: row.returns,
    };
    functions.set(fn, info);
    return info;
  }

  return {
    async rpc(fn, args = {}) {
      const info = await describeFunction(fn);
      const keys = Object.keys(args);
      const params = keys.map((key) => {
        const value = args[key];
        return typeof value === 'object' && value !== null ? JSON.stringify(value) : value;
      });
      const call = keys
        .map((key, i) => {
          const position = info.names.indexOf(key);
          return `${identifier(key)} => $${i + 1}::${info.types[position] ?? 'text'}`;
        })
        .join(', ');
      const target = `public.${identifier(fn)}(${call})`;
      try {
        if (info.returns === 'void') {
          await session.query(`select ${target}`, params);
          return null;
        }
        if (info.returnsSet) {
          const [row] = await session.query<{ j: unknown }>(
            `select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) as j from ${target} r`,
            params,
          );
          return row?.j;
        }
        const [row] = await session.query<{ j: unknown }>(
          `select to_jsonb(r) as j from ${target} r`,
          params,
        );
        return row?.j ?? null;
      } catch (error) {
        throw asServerError(error);
      }
    },

    async select(table, query: SelectQuery) {
      const params: unknown[] = [];
      const where: string[] = [];
      const add = (column: string, operator: string, value: unknown): void => {
        params.push(value);
        where.push(`${identifier(column)} ${operator} $${params.length}`);
      };
      for (const [column, value] of Object.entries(query.eq ?? {})) add(column, '=', value);
      for (const [column, value] of Object.entries(query.gte ?? {})) add(column, '>=', value);
      for (const [column, value] of Object.entries(query.lte ?? {})) add(column, '<=', value);
      const sql = `select to_jsonb(t) as j from public.${identifier(table)} t
        ${where.length > 0 ? `where ${where.join(' and ')}` : ''}
        order by ${query.order.map(identifier).join(', ')}`;
      try {
        return (await session.query<{ j: Row }>(sql, params)).map((r) => r.j);
      } catch (error) {
        throw asServerError(error);
      }
    },

    async insert(table, row) {
      const columns = Object.keys(row);
      const params = columns.map((column) => {
        const value = row[column];
        return typeof value === 'object' && value !== null ? JSON.stringify(value) : value;
      });
      const placeholders = columns.map((column, i) => {
        const value = row[column];
        return `$${i + 1}${typeof value === 'object' && value !== null ? '::jsonb' : ''}`;
      });
      try {
        const [stored] = await session.query<{ j: Row }>(
          `insert into public.${identifier(table)} (${columns.map(identifier).join(', ')})
           values (${placeholders.join(', ')}) returning to_jsonb(${identifier(table)}.*) as j`,
          params,
        );
        return stored?.j ?? {};
      } catch (error) {
        throw asServerError(error);
      }
    },

    async remove(table, id) {
      try {
        await session.query(`delete from public.${identifier(table)} where id = $1`, [id]);
      } catch (error) {
        throw asServerError(error);
      }
    },
  };
}

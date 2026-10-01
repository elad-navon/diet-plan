import { type SupabaseClient } from '@supabase/supabase-js';
import { type Row, type SelectQuery, type ServerGateway, ServerError } from './gateway';

/** The API returns at most 1,000 rows per request (a Supabase default); lists are fetched page by page. */
const PAGE_SIZE = 1000;

interface ApiError {
  code?: string | undefined;
  message: string;
}

/** What every supabase-js request resolves to (typed loosely here: the rows are checked in mapping.ts). */
interface ApiResponse {
  data: unknown;
  error: ApiError | null;
  status: number;
}

function fail(error: ApiError, status: number): never {
  // supabase-js reports a request that never got an answer (offline, DNS, blocked) with status 0.
  throw new ServerError(error.code ?? '', error.message, status);
}

/** The thin adapter between our narrow gateway and Supabase's HTTP API. Verified against the real project. */
export function createSupabaseGateway(client: SupabaseClient): ServerGateway {
  return {
    async rpc(fn, args) {
      const { data, error, status } = (await client.rpc(fn, args ?? {})) as ApiResponse;
      if (error) fail(error, status);
      return data;
    },

    async select(table, query: SelectQuery) {
      const rows: Row[] = [];
      const seen = new Set<unknown>();
      for (let from = 0; ; from += PAGE_SIZE) {
        let request = client.from(table).select('*');
        for (const [column, value] of Object.entries(query.eq ?? {})) {
          request = request.eq(column, value);
        }
        for (const [column, value] of Object.entries(query.gte ?? {})) {
          request = request.gte(column, value);
        }
        for (const [column, value] of Object.entries(query.lte ?? {})) {
          request = request.lte(column, value);
        }
        for (const column of query.order) request = request.order(column, { ascending: true });
        const { data, error, status } = (await request.range(
          from,
          from + PAGE_SIZE - 1,
        )) as ApiResponse;
        if (error) fail(error, status);
        const page = (data ?? []) as Row[];
        for (const row of page) {
          // Rows added while paging can shift a page; never list the same row twice.
          const key = row['id'] ?? row['user_id'];
          if (key !== undefined && seen.has(key)) continue;
          seen.add(key);
          rows.push(row);
        }
        if (page.length < PAGE_SIZE) return rows;
      }
    },

    async insert(table, row) {
      const { data, error, status } = (await client
        .from(table)
        .insert(row)
        .select()
        .single()) as ApiResponse;
      if (error) fail(error, status);
      return data as Row;
    },

    async remove(table, id) {
      const { error, status } = await client.from(table).delete().eq('id', id);
      if (error) fail(error, status);
    },
  };
}

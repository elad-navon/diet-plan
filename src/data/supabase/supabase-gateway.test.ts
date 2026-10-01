import { type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { toDataError } from './errors';
import { ServerError, type Row } from './gateway';
import { createSupabaseGateway } from './supabase-gateway';

/** The HTTP adapter, with a fake client: paging past the 1,000-row cap (INT-10) and error reporting. */

interface Call {
  method: string;
  args: unknown[];
}

interface FakeOptions {
  rows?: Row[];
  error?: { code?: string; message: string; status: number };
}

function fakeClient(options: FakeOptions) {
  const calls: Call[] = [];
  const record = (method: string, args: unknown[]): void => void calls.push({ method, args });
  const builder = {
    select: (...args: unknown[]) => (record('select', args), builder),
    eq: (...args: unknown[]) => (record('eq', args), builder),
    gte: (...args: unknown[]) => (record('gte', args), builder),
    lte: (...args: unknown[]) => (record('lte', args), builder),
    order: (...args: unknown[]) => (record('order', args), builder),
    range: (from: number, to: number) => {
      record('range', [from, to]);
      if (options.error) {
        return Promise.resolve({ data: null, error: options.error, status: options.error.status });
      }
      return Promise.resolve({
        data: (options.rows ?? []).slice(from, to + 1),
        error: null,
        status: 200,
      });
    },
  };
  const client = {
    from: (table: string) => (record('from', [table]), builder),
    rpc: (fn: string, args: unknown) => {
      record('rpc', [fn, args]);
      return Promise.resolve(
        options.error
          ? { data: null, error: options.error, status: options.error.status }
          : { data: { ok: true }, error: null, status: 200 },
      );
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: `id-${i}` }));

describe('select', () => {
  it('returns every row of a list longer than the 1,000-row API cap', async () => {
    const { client, calls } = fakeClient({ rows: rows(2500) });
    const result = await createSupabaseGateway(client).select('meals', {
      order: ['eaten_at', 'id'],
    });
    expect(result).toHaveLength(2500);
    expect(calls.filter((c) => c.method === 'range').map((c) => c.args)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('asks for one more page when the last one is exactly full, then stops', async () => {
    const { client, calls } = fakeClient({ rows: rows(1000) });
    const result = await createSupabaseGateway(client).select('meals', { order: ['id'] });
    expect(result).toHaveLength(1000);
    expect(calls.filter((c) => c.method === 'range')).toHaveLength(2);
  });

  it('never lists a row twice when the data shifts between pages', async () => {
    const shifted = [...rows(1000), { id: 'id-999' }, { id: 'id-1000' }];
    const { client } = fakeClient({ rows: shifted });
    const result = await createSupabaseGateway(client).select('meals', { order: ['id'] });
    expect(result).toHaveLength(1001);
  });

  it('passes filters and ordering through', async () => {
    const { client, calls } = fakeClient({ rows: [] });
    await createSupabaseGateway(client).select('meals', {
      eq: { id: 'x' },
      gte: { local_date: '2026-10-01' },
      lte: { local_date: '2026-10-07' },
      order: ['eaten_at', 'id'],
    });
    expect(calls.map((c) => c.method)).toEqual([
      'from',
      'select',
      'eq',
      'gte',
      'lte',
      'order',
      'order',
      'range',
    ]);
  });

  it('turns an API error into a ServerError carrying code, message and status', async () => {
    const { client } = fakeClient({
      error: { code: 'PGRST301', message: 'JWT expired', status: 401 },
    });
    const failure = await createSupabaseGateway(client)
      .select('meals', { order: ['id'] })
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ServerError);
    expect(failure).toMatchObject({ sqlState: 'PGRST301', message: 'JWT expired', status: 401 });
    expect(toDataError(failure).code).toBe('unauthenticated');
  });
});

describe('rpc', () => {
  it('returns the function result', async () => {
    const { client, calls } = fakeClient({});
    expect(await createSupabaseGateway(client).rpc('add_meal', { p: { id: 'x' } })).toEqual({
      ok: true,
    });
    expect(calls[0]).toEqual({ method: 'rpc', args: ['add_meal', { p: { id: 'x' } }] });
  });

  it('keeps the database error text, so the app can tell a conflict from a failure', async () => {
    const { client } = fakeClient({
      error: { code: 'P0001', message: 'version_conflict', status: 400 },
    });
    const failure = await createSupabaseGateway(client)
      .rpc('update_meal', {})
      .catch((e: unknown) => e);
    expect(toDataError(failure).code).toBe('version_conflict');
  });

  it('reports "could not reach the server" (status 0) as a network problem', async () => {
    const { client } = fakeClient({
      error: { code: '', message: 'TypeError: Failed to fetch', status: 0 },
    });
    const failure = await createSupabaseGateway(client)
      .rpc('add_meal', {})
      .catch((e: unknown) => e);
    expect(toDataError(failure).code).toBe('network');
  });
});

describe('toDataError', () => {
  it.each([
    ['version_conflict', 'P0001', 400, 'version_conflict'],
    ['id_conflict', 'P0001', 400, 'id_conflict'],
    ['not_found', 'P0001', 400, 'not_found'],
    ['limit_reached', 'P0001', 400, 'limit_reached'],
    ['no_profile', 'P0001', 400, 'no_profile'],
    ['plan_in_past', 'P0001', 400, 'plan_in_past'],
    ['eaten_at_in_future', 'P0001', 400, 'in_future'],
    ['measured_at_in_future', 'P0001', 400, 'in_future'],
    ['eaten_at_too_old', 'P0001', 400, 'too_old'],
    ['unauthenticated', '28000', 403, 'unauthenticated'],
    ['permission denied for table meals', '42501', 403, 'unauthenticated'],
    ['new row violates check constraint "meals_kcal_check"', '23514', 400, 'invalid'],
    ['invalid input syntax for type uuid: "x"', '22P02', 400, 'invalid'],
    ['connection reset', '', 0, 'network'],
    ['upstream timeout', '', 504, 'server'],
    ['something else', 'XX000', 500, 'server'],
  ])('%s -> %s', (message, sqlState, status, expected) => {
    expect(toDataError(new ServerError(sqlState, message, status)).code).toBe(expected);
  });

  it('wraps anything that is not a ServerError', () => {
    expect(toDataError(new Error('boom')).code).toBe('server');
    expect(toDataError('text').code).toBe('server');
  });
});

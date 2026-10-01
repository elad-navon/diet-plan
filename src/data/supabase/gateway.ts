/**
 * The small surface the server repositories need from "the server". Keeping it this narrow means the
 * repository logic (mapping, validation, error translation) is tested against a real Postgres, and only a
 * thin adapter (supabase-gateway.ts) talks to Supabase's HTTP API.
 */

export type Row = Record<string, unknown>;

export interface SelectQuery {
  eq?: Record<string, string | number | boolean>;
  gte?: Record<string, string | number>;
  lte?: Record<string, string | number>;
  /** Ascending sort keys. The last one must be unique (the id) so paging never skips or repeats a row. */
  order: readonly string[];
}

export interface ServerGateway {
  /** Calls a database function. Resolves with its JSON result (null for functions that return nothing). */
  rpc(fn: string, args?: Record<string, unknown>): Promise<unknown>;
  /** Every matching row. Pages through the results, so lists longer than the API's 1,000-row cap are complete. */
  select(table: string, query: SelectQuery): Promise<Row[]>;
  /** Inserts one row and returns it as stored. */
  insert(table: string, row: Row): Promise<Row>;
  remove(table: string, id: string): Promise<void>;
}

/** A failure reported by the server (or by reaching it). */
export class ServerError extends Error {
  constructor(
    /** Postgres SQLSTATE or PostgREST code; empty for failures before any response. */
    readonly sqlState: string,
    message: string,
    /** HTTP status; 0 when the server could not be reached. */
    readonly status: number,
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

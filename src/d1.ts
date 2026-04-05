export interface D1ResultRow {
  [key: string]: unknown;
}

export interface D1ExecResult<T = D1ResultRow> {
  results?: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = D1ResultRow>(): Promise<T | null>;
  all<T = D1ResultRow>(): Promise<D1ExecResult<T>>;
  run(): Promise<D1ExecResult>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

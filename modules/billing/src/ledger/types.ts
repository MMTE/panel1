/**
 * Shared ledger types not tied to the DB schema (drizzle $inferSelect types live
 * in schema.ts).
 */

/**
 * A row returned by {@link LedgerDb.query}: a plain object keyed by column name.
 * Column values are whatever the driver returns (`bigint` columns arrive as
 * strings over the JSON wire format; callers coerce with `BigInt(...)`).
 */
export interface QueryResultRow {
  [column: string]: unknown;
}

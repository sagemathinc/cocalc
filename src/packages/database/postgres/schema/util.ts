// Certain field aren't allowed without quoting in Postgres.
// Also case sensitivity can be messed up by not quoting.  So
// we use this to quote.
export function quoteField(field: string): string {
  if (field[0] === '"') {
    // already quoted
    return field;
  }
  return `"${field}"`;
}

/* Some random little utils */

// Convert timestamp fields as returned from postgresql queries
// into ms since the epoch, as a number.
export function toEpoch(rows, fields) {
  for (const row of rows) {
    for (const field of fields) {
      if (row[field]) {
        row[field] = new Date(row[field]).valueOf();
      }
    }
  }
}

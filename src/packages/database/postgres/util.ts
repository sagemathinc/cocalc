/* Some random little utils */
import { is_array } from "@cocalc/util/misc";

// Convert timestamp fields as returned from postgresql queries
// into ms since the epoch, as a number.
export function toEpoch(rows: object | object[], fields: string[]): void {
  if (!is_array(rows)) {
    rows = [rows];
  }
  // @ts-ignore
  for (const row of rows) {
    for (const field of fields) {
      if (row[field]) {
        row[field] = new Date(row[field]).valueOf();
      }
    }
  }
}

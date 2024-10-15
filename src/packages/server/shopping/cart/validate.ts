// This ensures the date ranges in the rows are valid in the
// database, and also mutates the rows themselves to be valid.
export async function ensureValidLicenseIntervals(rows: any[], pool) {
  for (const row of rows) {
    const { description } = row;
    const range = description?.range;
    if (range == null) {
      // subscriptions, etc.
      continue;
    }
    // "range": ["2024-09-30T07:00:00.000Z", "2024-10-16T06:58:59.999Z"] is two UTC strings.  We
    // ensure that the start endpoint is >= now and the end endpoint is >= start + 1 hour.
    let start = new Date(range[0]);
    let end = new Date(range[1]);
    const now = new Date();
    let changed = false;
    if (start < now) {
      changed = true;
      start = now;
    }
    // 1 hour in milliseconds
    const oneHourLater = new Date(start.getTime() + 3600 * 1000);
    if (end < oneHourLater) {
      changed = true;
      end = oneHourLater;
    }
    if (changed) {
      description.range = [start.toISOString(), end.toISOString()];
      await pool.query(
        "UPDATE shopping_cart_items SET description=$1 WHERE id=$2",
        [description, row.id],
      );
    }
  }
}

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import LRU from "lru-cache";

const logger = getLogger("purchase:closing-date");

// Get the most recent closing date that is in the past.
export async function getLastClosingDate(account_id: string): Promise<Date> {
  // day is a number between 1 and 28 and the closing date is the day-th day of the month.
  const day = await getClosingDay(account_id);
  // Compute the most recent Date that is in the past, is
  // at midnight UTC, and lies on the given day of the month.
  const today = new Date();
  return prevDateWithDay(today, day);
}

export function prevDateWithDay(date: Date, day: number): Date {
  const month = date.getMonth();
  const year = date.getFullYear();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const lastClosingDayOfMonth =
    day > lastDayOfMonth
      ? new Date(year, month - 1, lastDayOfMonth)
      : new Date(year, month, day);
  while (lastClosingDayOfMonth.valueOf() > date.valueOf()) {
    lastClosingDayOfMonth.setMonth(lastClosingDayOfMonth.getMonth() - 1);
  }
  return new Date(
    Date.UTC(
      lastClosingDayOfMonth.getFullYear(),
      lastClosingDayOfMonth.getMonth(),
      lastClosingDayOfMonth.getDate()
    )
  );
}

// Get the next upcoming closing date in the future.
export async function getNextClosingDate(account_id: string): Promise<Date> {
  const day = await getClosingDay(account_id);
  // Compute the next Date that is in the future, is at midnight UTC,
  // and lies on the given day of the month.
  const today = new Date();
  return nextDateWithDay(today, day);
}

export function nextDateWithDay(date: Date, day: number): Date {
  const month = date.getMonth();
  const year = date.getFullYear();
  let nextDate = new Date(Date.UTC(year, month, day));
  if (nextDate <= date) {
    nextDate = new Date(Date.UTC(year, month + 1, day));
  }
  return nextDate;
}

// Get the closing day for this account.  If not set, we set it to a few days ago.
// Safe to call frequently; only does work the first time (per hour).
const closingDateCache = new LRU<string, number>({
  ttl: 1000 * 60 * 60,
  max: 10000,
});
export async function getClosingDay(account_id: string): Promise<number> {
  if (closingDateCache.has(account_id)) {
    return closingDateCache.get(account_id) as number;
  }
  const pool = getPool();
  let closingDay: number;

  try {
    const { rows } = await pool.query(
      "SELECT purchase_closing_day FROM accounts WHERE account_id = $1",
      [account_id]
    );
    closingDay = rows[0]?.["purchase_closing_day"];
    if (closingDay == null) {
      // If no closing day exists, set it to a few days ago.
      // We compute the current day of the month, then subtract 3,
      // and normalize to be between 1 and 28.

      const today = new Date();
      const currentDayOfMonth = today.getDate();
      closingDay = (Math.max(currentDayOfMonth - 3, 1) % 28) + 1;

      await setClosingDay(account_id, closingDay);
    }
  } catch (e) {
    logger.error(`Error getting closing day: ${e.message}`);
    throw Error(e);
  }
  closingDateCache.set(account_id, closingDay);
  return closingDay;
}

// Do NOT make this directly accessible via the api, obviously.
export async function setClosingDay(
  account_id: string,
  day: number,
  client?
): Promise<void> {
  const pool = client ?? getPool();
  if (day < 1 || day > 28) {
    throw Error("day must be between 1 and 28");
  }
  try {
    closingDateCache.delete(account_id);
    await pool.query(
      "UPDATE accounts SET purchase_closing_day = $1 WHERE account_id = $2",
      [day, account_id]
    );
  } catch (e) {
    logger.error(`Error setting closing day: ${e.message}`);
    throw e;
  }
}

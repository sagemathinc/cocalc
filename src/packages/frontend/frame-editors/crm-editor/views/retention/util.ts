import dayjs from "dayjs";

export function startOfDayUTC(d): Date {
  const date = dayjs(d).toDate();
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  return new Date(Date.UTC(year, month, day));
}
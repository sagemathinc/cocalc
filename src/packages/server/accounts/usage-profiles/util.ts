import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
dayjs.extend(utc); // use utc plugin

export function midnightUtcPreviousDay() {
  return dayjs().utc().startOf("day").subtract(1, "day").toDate();
}

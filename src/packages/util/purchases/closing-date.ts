export function resetDay(date: Date): number {
  let day = date.getDate();
  // if date is within 8 hours of the upcoming midnight in UTC, add 1 to day.
  // This is to make sure a statement still gets cut after making the change.
  const hours = date.getUTCHours();
  if (hours >= 16) {
    day += 1;
  }
  if (day > 28) {
    return 1;
  }
  return day;
}

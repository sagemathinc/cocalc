export function timeInSeconds(field: string, asField?: string): string {
  return ` EXTRACT(EPOCH FROM ${field})*1000 as ${asField ?? field} `;
}

// Given number of seconds **in the future**.
export function expireTime(ttl_s: number = 0): Date {
  return new Date(new Date().valueOf() + ttl_s * 1000);
}

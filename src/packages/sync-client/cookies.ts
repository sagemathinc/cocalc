import * as cookie from "cookie";

export function toCookieHeader(obj: object): string {
  const pairs: string[] = [];

  for (const key in obj) {
    pairs.push(cookie.serialize(key, obj[key]));
  }

  return pairs.join("; ");
}

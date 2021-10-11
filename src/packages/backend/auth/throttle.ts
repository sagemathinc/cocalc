/*
Some simple sign in throttling to reduce the impact of brute force
attacks.  This is in memory per-backend server, and doesn't touch
the database.
*/

import LRU from "lru-cache";

const emailShortCache = new LRU<string, number>({
  max: 10000, // avoid memory issues
  maxAge: 1000 * 60,
});
const emailLongCache = new LRU<string, number>({
  max: 20000,
  maxAge: 1000 * 60 * 60,
});
const ipShortCache = new LRU<string, number>({ max: 10000, maxAge: 1000 * 60 });
const ipLongCache = new LRU<string, number>({
  max: 20000,
  maxAge: 1000 * 60 * 60,
});

export function signInCheck(email: string, ip?: string): string | undefined {
  if ((emailShortCache.get(email) ?? 0) > 5) {
    // A given email address is allowed at most 5 failed login attempts per minute
    return `Too many attempts per minute to sign in as "${email}". Wait one minute, then try again.`;
  }
  if ((emailLongCache.get(email) ?? 0) > 50) {
    // A given email address is allowed at most 50 failed login attempts per hour.
    return `Too many attempts per hour to sign in as "${email}". Wait about an hour, then try again.`;
  }

  if (ip != null && (ipShortCache.get(ip) ?? 0) > 30) {
    // A given ip address is allowed at most 30 failed login attempts per minute.
    return `Too many attempts per minute to sign in from your computer. Wait one minute, then try again.`;
  }
  if (ip != null && (ipLongCache.get(ip) ?? 0) > 200) {
    // A given ip address is allowed at most 200 failed login attempts per hour.
    return `Too many attempts per hour to sign in from your computer. Wait about an hour, then try again.`;
  }
}

export function recordFail(email: string, ip?: string): void {
  emailShortCache.set(email, (emailShortCache.get(email) ?? 0) + 1);
  emailLongCache.set(email, (emailLongCache.get(email) ?? 0) + 1);
  if (ip != null) {
    ipShortCache.set(ip, (ipShortCache.get(ip) ?? 0) + 1);
    ipLongCache.set(ip, (ipLongCache.get(ip) ?? 0) + 1);
  }
}

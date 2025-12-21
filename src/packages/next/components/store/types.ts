export const StorePages = [
  "membership",
  "site-license",
  "course",
  "boost",
  "dedicated",
  "cart",
  "checkout",
  "processing",
  "vouchers",
  "congrats",
] as const;

export type StorePagesTypes = (typeof StorePages)[number];

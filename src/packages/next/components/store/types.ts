export const StorePages = [
  "site-license",
  "boost",
  "dedicated",
  "cart",
  "checkout",
  "vouchers",
  "congrats",
] as const;

export type StorePagesTypes = typeof StorePages[number];

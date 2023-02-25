export const StorePages = [
  "site-license",
  "boost",
  "dedicated",
  "cart",
  "checkout",
  "create-vouchers",
  "congrats",
] as const;

export type StorePagesTypes = typeof StorePages[number];

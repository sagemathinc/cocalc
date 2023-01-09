export const StorePages = [
  "site-license",
  "boost",
  "dedicated",
  "cart",
  "checkout",
  "congrats",
] as const;

export type StorePagesTypes = typeof StorePages[number];

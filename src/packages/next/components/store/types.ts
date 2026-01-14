export const StorePages = [
  "membership",
  "cart",
  "checkout",
  "processing",
  "vouchers",
  "congrats",
] as const;

export type StorePagesTypes = (typeof StorePages)[number];

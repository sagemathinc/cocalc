import type { Flavor, Stock } from "./api-types";

export interface HyperstackPriceData {
  flavors: Flavor[];
  stocks: Stock[];
}

// make it a module
export {};

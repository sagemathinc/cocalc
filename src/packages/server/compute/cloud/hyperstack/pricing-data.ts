/*
Explain it...

*/

import { getFlavors, getStocks } from "./client";

export default async function getPricingData() {
  const flavors = await getFlavors(true);
  const stocks = await getStocks(true);
  return { flavors, stocks };
}

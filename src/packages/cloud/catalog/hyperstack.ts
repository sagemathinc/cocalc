import type {
  FlavorRegionData,
  Image,
  RegionInfo,
  Stock,
} from "@cocalc/util/compute/cloud/hyperstack/api-types";
import { getFlavors, getImages, getRegions, getStocks } from "../hyperstack";

export type HyperstackCatalog = {
  regions: RegionInfo[];
  flavors: FlavorRegionData[];
  images: Image[];
  stocks: Stock[];
};

export async function fetchHyperstackCatalog(): Promise<HyperstackCatalog> {
  const [regions, flavors, images, stocks] = await Promise.all([
    getRegions(),
    getFlavors(),
    getImages(),
    getStocks(),
  ]);
  return { regions, flavors, images, stocks };
}

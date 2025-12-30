import type {
  FlavorRegionData,
  Image,
  RegionInfo,
  Stock,
} from "@cocalc/util/compute/cloud/hyperstack/api-types";
import { getFlavors, getImages, getRegions, getStocks } from "../hyperstack";
import { setHyperstackConfig } from "../hyperstack/config";
import type { CatalogEntry } from "./types";

export type HyperstackCatalog = {
  regions: RegionInfo[];
  flavors: FlavorRegionData[];
  images: Image[];
  stocks: Stock[];
};

export async function fetchHyperstackCatalog(opts?: {
  apiKey?: string;
  prefix?: string;
}): Promise<HyperstackCatalog> {
  if (opts?.apiKey) {
    setHyperstackConfig({ apiKey: opts.apiKey, prefix: opts.prefix });
  }
  const [regions, flavors, images, stocks] = await Promise.all([
    getRegions(),
    getFlavors(),
    getImages(),
    getStocks(),
  ]);
  return { regions, flavors, images, stocks };
}

export function hyperstackCatalogEntries(
  catalog: HyperstackCatalog,
): CatalogEntry[] {
  return [
    {
      kind: "regions",
      scope: "global",
      payload: catalog.regions,
    },
    {
      kind: "flavors",
      scope: "global",
      payload: catalog.flavors,
    },
    {
      kind: "images",
      scope: "global",
      payload: catalog.images,
    },
    {
      kind: "stocks",
      scope: "global",
      payload: catalog.stocks,
    },
  ];
}

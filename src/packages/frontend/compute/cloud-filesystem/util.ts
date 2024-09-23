import { capitalize } from "@cocalc/util/misc";
import { markup } from "@cocalc/util/compute/cloud/google-cloud/compute-cost";

export function editModalStyle(cloudFilesystem) {
  return {
    borderWidth: "0.5px 10px",
    borderStyle: "solid",
    padding: "10px 15px",
    borderRadius: "5px",
    borderColor: cloudFilesystem.color ?? "#666",
  };
}

// Price returned from this includes markup
export function getDataStoragePriceRange({
  priceData,
  bucket_location,
  bucket_storage_class,
}): { min: number | null; max: number | null } {
  if (priceData == null) {
    return { min: null, max: null };
  }
  if (bucket_storage_class.startsWith("autoclass")) {
    const min = getDataStoragePrice({
      priceData,
      bucket_location,
      bucket_storage_class: bucket_storage_class.split("-")[1],
    });
    const max = getDataStoragePrice({
      priceData,
      bucket_location,
      bucket_storage_class: "standard",
    });
    return { min, max };
  } else {
    const price = getDataStoragePrice({
      priceData,
      bucket_location,
      bucket_storage_class,
    });
    return { min: price, max: price };
  }
}

// Price returned from this includes markup
export function getDataStoragePrice({
  priceData,
  bucket_location,
  bucket_storage_class,
}): number | null {
  if (priceData == null) {
    return null;
  }
  let cost;
  if (!bucket_location.includes("-")) {
    cost =
      priceData.storage?.atRest?.multiRegions?.[bucket_location]?.[
        capitalize(bucket_storage_class)
      ];
  } else {
    cost =
      priceData.storage?.atRest?.regions?.[bucket_location]?.[
        capitalize(bucket_storage_class)
      ];
  }
  return markup({
    cost,
    priceData,
  });
}

const alpha = "abcdefghijklmnopqrstuvwxyz".split("");
export function getCity({ region, priceData }) {
  if (priceData?.zones == null) {
    return "";
  }
  for (const x of alpha) {
    const z = priceData.zones[`${region}-${x}`];
    if (z != null) {
      return z.location.split(",")[1].trim();
    }
  }
  return "";
}

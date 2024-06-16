import { capitalize } from "@cocalc/util//misc";

export function editModalStyle(cloudFilesystem) {
  return {
    borderWidth: "0.5px 10px",
    borderStyle: "solid",
    padding: "10px 15px",
    borderRadius: "5px",
    borderColor: cloudFilesystem.color ?? "#666",
  };
}

export function getDataStoragePriceRange({
  prices,
  bucket_location,
  bucket_storage_class,
}): { min: number | null; max: number | null } {
  if (prices == null) {
    return { min: null, max: null };
  }
  if (bucket_storage_class.startsWith("autoclass")) {
    const min = getDataStoragePrice({
      prices,
      bucket_location,
      bucket_storage_class: bucket_storage_class.split("-")[1],
    });
    const max = getDataStoragePrice({
      prices,
      bucket_location,
      bucket_storage_class: "standard",
    });
    return { min, max };
  } else {
    const price = getDataStoragePrice({
      prices,
      bucket_location,
      bucket_storage_class,
    });
    return { min: price, max: price };
  }
}

export function getDataStoragePrice({
  prices,
  bucket_location,
  bucket_storage_class,
}): number | null {
  if (prices == null) {
    return null;
  }
  if (!bucket_location.includes("-")) {
    return prices.storage?.atRest?.multiRegions[bucket_location]?.[
      capitalize(bucket_storage_class)
    ];
  } else {
    return prices.storage?.atRest?.regions[bucket_location]?.[
      capitalize(bucket_storage_class)
    ];
  }
}

import { DirectoryListingEntry } from "@cocalc/util/types";

export default function filterListing({
  listing,
  search,
  showHidden,
}: {
  listing?: DirectoryListingEntry[] | null;
  search?: string;
  showHidden?: boolean;
}): DirectoryListingEntry[] | null {
  if (listing == null) {
    return null;
  }
  if (!showHidden) {
    listing = listing.filter((x) => !x.name.startsWith("."));
  }
  search = search?.trim()?.toLowerCase();
  if (!search || search.startsWith("/")) {
    return listing;
  }
  return listing.filter((x) => x.name.toLowerCase().includes(search));
}

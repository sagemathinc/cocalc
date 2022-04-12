import { LicenseType } from "./add-box";

// site license type
export function getType(item): LicenseType {
  const descr = item.description;
  if (descr.dedicated_disk != null && descr.dedicated_disk !== false) {
    return "dedicated-disk";
  }
  if (descr.dedicated_vm != null && descr.dedicated_vm !== false) {
    return "dedicated-vm";
  }
  throw new Error(`Unable to load license type of ${JSON.stringify(descr)}`);
}

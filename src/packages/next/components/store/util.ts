import { LicenseType } from "./add-box";

// site license type
export function getType(item): LicenseType {
  const descr = item.description;
  if (descr.dedicated_disk != null && descr.dedicated_disk !== false) {
    return "disk";
  } else if (descr.dedicated_vm != null && descr.dedicated_vm !== false) {
    return "vm";
  } else if (descr.boost === true) {
    return "boost";
  } else {
    return "regular";
  }
}

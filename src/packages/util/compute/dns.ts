import { valid_dns_name } from "@cocalc/util/db-schema/site-defaults";
import { isReserved } from "@cocalc/util/db-schema/name-rules";

// cost right now for DNS
export const DNS_COST_PER_MONTH = 5;
export const DNS_COST_PER_HOUR = DNS_COST_PER_MONTH / 730;

export function checkValidDomain(name) {
  if (isReserved(name)) {
    throw Error(`${name} is reserved for system use`);
  }
  if (typeof name != "string") {
    throw Error("name must be a string");
  }
  if (!valid_dns_name(name)) {
    throw Error("ONLY letters and dashes are allowed");
  }
  if (name.includes(".")) {
    throw Error("dots . are not allowed");
  }
  if (name.length > 63 || name.length == 0) {
    throw Error("name must be between 1 and 63 characters");
  }
  if (name[0] == "-" || name[name.length - 1] == "-") {
    throw Error("name must NOT start or end with a dash");
  }
}

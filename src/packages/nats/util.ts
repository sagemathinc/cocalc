import generateVouchers from "@cocalc/util/vouchers";

// nice alphanumeric string that can be used as nats subject, and very
// unlikely to randomly collide with another browser tab from this account.
export function randomId() {
  return generateVouchers({ count: 1, length: 10 })[0];
}

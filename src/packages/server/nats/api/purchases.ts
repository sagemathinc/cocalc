import getBalance from "@cocalc/server/purchases/get-balance";
import getMinBalance0 from "@cocalc/server/purchases/get-min-balance";

export { getBalance };

export async function getMinBalance({ account_id }) {
  return await getMinBalance0(account_id);
}

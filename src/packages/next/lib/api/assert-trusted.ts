import getMinBalance from "@cocalc/server/purchases/get-min-balance";
import { currency } from "@cocalc/util/misc";

const THRESH = -100;
export const TRUST_ERROR_MESSAGE = `Please contact support and request a minimum balance that is under ${currency(THRESH)} to access this API endpoint.`;

export default async function assertTrusted(account_id: string): Promise<void> {
  if ((await getMinBalance(account_id)) > THRESH) {
    throw Error(TRUST_ERROR_MESSAGE);
  }
}

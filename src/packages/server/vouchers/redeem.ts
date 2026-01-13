/* Redeem a voucher */

import { getVoucherCode, redeemVoucherCode } from "./codes";
import { getVoucher } from "./vouchers";
import { getLogger } from "@cocalc/backend/logger";
import createCredit from "@cocalc/server/purchases/create-credit";
import { getTransactionClient } from "@cocalc/database/pool";
import { getUser } from "@cocalc/server/purchases/statements/email-statement";
import { moneyToCurrency } from "@cocalc/util/money";
import send, { support, url } from "@cocalc/server/messages/send";
import adminAlert from "@cocalc/server/messages/admin-alert";

const log = getLogger("server:vouchers:redeem");

interface Options {
  account_id: string;
  code: string;
}

interface CreatedCash {
  type: "cash";
  amount: number;
  purchase_id: number;
}

export type CreatedItem = CreatedCash;

export default async function redeemVoucher({
  account_id,
  code,
}: Options): Promise<CreatedItem[]> {
  // get info from db about given voucher code
  log.debug("code=", code);
  const voucherCode = await getVoucherCode(code);
  if (voucherCode.when_redeemed != null) {
    log.debug(code, "already redeemed");
    if (voucherCode.redeemed_by == account_id) {
      throw Error(`You already redeem the voucher '${code}'.`);
    } else {
      throw Error(`Voucher '${code}' was already redeemed.`);
    }
  }
  const voucher = await getVoucher(voucherCode.id);
  const now = new Date();
  if (voucher.active != null && now < voucher.active) {
    log.debug(code, "not yet active", now, voucher.active);
    throw Error(`Voucher '${code}' is not yet active.`);
  }
  if (voucher.expire != null && now >= voucher.expire) {
    log.debug(code, "already expired", now, voucher.expire);
    throw Error(`Voucher '${code}' has already expired.`);
  }

  const client = await getTransactionClient();
  const createdItems: CreatedItem[] = [];
  try {
    // start atomic transaction

    // array because this used to support multiple items, and I don't want to change db schema...
    const purchase_ids: number[] = [];
    const id = await createCredit({
      account_id,
      amount: voucher.cost,
      tag: "cash-voucher",
      notes: voucher.title,
      description: { voucher_code: code },
      client,
    });
    purchase_ids.push(id);
    createdItems.push({
      type: "cash",
      amount: voucher.cost,
      purchase_id: id,
    });
    // set voucher as redeemed in the voucher_code:
    await redeemVoucherCode({
      code,
      account_id,
      purchase_ids,
      client,
    });
    await client.query("COMMIT");

    try {
      sendRedeemAlerts({ account_id, voucher, code, id });
    } catch (err) {
      // this should never happen

      log.debug(`WARNING -- issue sending redeem alert: ${err}`);

      adminAlert({
        subject: `Something went wrong sending voucher redeem alert`,
        body: `
- Voucher Code ${code}
- ERROR: ${err}
`,
      });
    }

    return createdItems;
  } catch (err) {
    await client.query("ROLLBACK");
    log.debug("error -- rolling back entire transaction", err);
    throw err;
  } finally {
    // end atomic transaction
    client.release();
  }
}

async function sendRedeemAlerts({ account_id, voucher, code, id }) {
  const { name: creator } = await getUser(voucher.created_by);

  const { name: userName } = await getUser(account_id);

  const subject = `Voucher ${code} Redeemed for ${moneyToCurrency(voucher.cost)}`;

  // to creator of voucher
  await send({
    to_ids: [voucher.created_by],
    subject,
    body: `
Hello ${creator},

A voucher you created with the code '${code}' was redeemed
by ${userName} for ${moneyToCurrency(voucher.cost)}.

- [Browse all codes for this voucher](${await url("vouchers", voucher.id)})

${await support()}
`,
  });

  const purchaseUrl = await url("settings", `purchases#id=${id}`);
  await send({
    to_ids: [account_id],
    subject,
    body: `
Hello ${userName},

You successfully redeemed a voucher from ${creator} with the code '${code}'
for ${moneyToCurrency(voucher.cost)}.

- [View Account Credit Id = ${id}](${purchaseUrl})

${await support()}
`,
  });
}

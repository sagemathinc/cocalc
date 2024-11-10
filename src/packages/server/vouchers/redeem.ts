/* Redeem a voucher */

import { getVoucherCode, redeemVoucherCode } from "./codes";
import { getVoucher } from "./vouchers";
import { getLogger } from "@cocalc/backend/logger";
import createCredit from "@cocalc/server/purchases/create-credit";
import { getTransactionClient } from "@cocalc/database/pool";
import sendEmail from "@cocalc/server/email/send-email";
import { getServerSettings } from "@cocalc/database/settings";
import { getUser } from "@cocalc/server/purchases/statements/email-statement";
import { currency } from "@cocalc/util/misc";
import { join } from "path";
import basePath from "@cocalc/backend/base-path";

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
      throw Error(`Voucher '${code}' was already redeemed by somebody else.`);
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
      sendRedeemAlert({ account_id, voucher, code });
    } catch (err) {
      log.debug(`WARNING -- issue sending redeem alert: ${err}`);
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

async function sendRedeemAlert({ account_id, voucher, code }) {
  const { name, email_address: to } = await getUser(voucher.created_by);
  if (!to) {
    return;
  }

  const { site_name: siteName, dns } = await getServerSettings();
  const { name: userName, email_address: userEmail } =
    await getUser(account_id);
  const url = `https://${dns}${join(basePath, "vouchers")}`;

  const subject = `${siteName} Voucher ${code} Redeemed for ${currency(voucher.cost)}`;

  const text = `
Hello ${name},

A voucher you created with the code '${code}' was redeemed
by ${userName} (${userEmail}) for ${currency(voucher.cost)}.
To the status of all voucher codes for this voucher, see

${url}


 -- ${siteName}
`;

  const html = `
Hello ${name},

<br/><br/>

A voucher you created with the code '${code}' was redeemed
by ${userName} ${userEmail ? " (" + userEmail + ") " : ""} for ${currency(voucher.cost)}.
You can see the status of your vouchers at <a href="${url}">the voucher center</a>.

<br/><br/>

 -- ${siteName}
`;
  await sendEmail({ to, subject, text, html });
}

import getLogger from "@cocalc/backend/logger";
import { deprovision, stop } from "@cocalc/server/compute/control";
import { isPurchaseAllowed } from "@cocalc/server/purchases/is-purchase-allowed";
import { setError } from "@cocalc/server/compute/util";
import send, { name, support } from "@cocalc/server/messages/send";
import siteURL from "@cocalc/database/settings/site-url";
import getProjectTitle from "@cocalc/server/projects/get-title";
import { getServerSettings } from "@cocalc/database/settings";
import { getUser } from "@cocalc/server/purchases/statements/email-statement";
import TTLCache from "@isaacs/ttlcache";
import getMinBalance from "@cocalc/server/purchases/get-min-balance";
import adminAlert from "@cocalc/server/messages/admin-alert";

// turn VM off if you don't have at least this much left.
const COST_THRESH_DOLLARS = 1;

// If can't buy -- even if you increase all quotas and balance by
// this amount -- then delete.  This is to avoid bad situations, e.g.,
// buy 50TB of expensive disk, turn machine off, get a huge bill.
// On the other hand, a typical abuse situation involves somebody adding
// say $10 from a stolen credit card and then quickly spending as much
// as possible.  And they might do this with a large number of different
// accounts at once.  So we don't want this margin to be too large.
// Still we make it reasonably large since we really don't want to
// delete data for non-abuse users.
//
// NOTE: we do not automatically delete for a user with a negative balance
// until it's way below (DELETE_THRESH_MARGIN_NEGATIVE_BALANCE) their negative,
// as that indicates some trust.
const DELETE_THRESH_MARGIN_DEFAULT = 10;
const DELETE_THRESH_MARGIN_NEGATIVE_BALANCE = 200;

const logger = getLogger("server:compute:maintenance:purchase:low-balance");

export default async function lowBalance({ server }) {
  if (server.cloud == "onprem") {
    // currently there is no charge at all for onprem compute servers
    return;
  }
  if (server.state == "deprovisioned") {
    // We only need to worry if the server isn't already deprovisioned.
    return;
  }
  if (!(await checkAllowed("compute-server", server))) {
    return;
  }
  await checkAllowed("compute-server-network-usage", server);
}

async function checkAllowed(service, server) {
  let allowed = false;
  let reason: string | undefined = undefined;
  let alsoDelete = false;
  ({ allowed, reason } = await isPurchaseAllowed({
    account_id: server.account_id,
    service,
    cost: COST_THRESH_DOLLARS,
  }));

  if (allowed) {
    // normal purchase is allowed - we're good
    return true;
  }
  const minBalance = await getMinBalance(server.account_id);
  const margin =
    minBalance < 0
      ? DELETE_THRESH_MARGIN_NEGATIVE_BALANCE
      : DELETE_THRESH_MARGIN_DEFAULT;

  // is it just bad, or REALLY bad?
  const x = await isPurchaseAllowed({
    account_id: server.account_id,
    service,
    cost: COST_THRESH_DOLLARS,
    margin,
  });
  if (!x.allowed) {
    // REALLY BAD!
    alsoDelete = true;
    ({ allowed, reason } = x);
    logger.debug(
      "updatePurchase: attempting to delete server because user is very low on funds",
      server.id,
    );
  } else {
    if (server.state == "off") {
      // nothing to do since server already off
      return;
    }
    // ut oh, running low on money. Turn VM off.
    logger.debug(
      "updatePurchase: attempting to stop server because user is low on funds",
      server.id,
    );
  }

  let action, callToAction;

  if (alsoDelete) {
    action = "Computer Server Deprovisioned (Disk Deleted)";
    callToAction = `Add credit to your account, to prevent other compute servers from being deleted.`;
    adminAlert({
      subject: "CRITICAL -- investigate low balance situation!!",
      body: `
- User: ${await name(server.account_id)}

- Account id: ${server.account_id}

- Global Server id: ${server.id}

- Project Specific Server id: ${server.project_specific_id}

- Action taken: ${action}`,
    });
  } else {
    action = "Computer Server Turned Off";
    callToAction = `[Add credit to your account or enable automatic deposits, so your compute server isn't deleted.](${await siteURL()}/settings/payg)`;
    adminAlert({
      subject: "WARNING -- low balance situation",
      body: `
- User: ${await name(server.account_id)}

- Account id: ${server.account_id}

- Global Server id: ${server.id}

- Project Specific Server id: ${server.project_specific_id}


Server automatically stopped, but not deleted.`,
    });
  }

  notifyUser({
    server,
    service,
    action,
    callToAction,
  });

  try {
    if (alsoDelete) {
      await deprovision(server);
    } else {
      await stop(server);
    }
    await setError(server.id, `${action}. ${callToAction} ${reason ?? ""}`);
  } catch (err) {
    logger.debug("updatePurchase: attempt to halt server failed -- ", err);
  }
  return false;
}

const sentCache = new TTLCache({ ttl: 12 * 60 * 60 * 1000 });

async function notifyUser({ server, service, action, callToAction }) {
  // TEMPORARY: never send more than 3 emails every 12 hours for a given compute server.
  // There's nothing below keeping repeated messages from going out when things are
  // in a bad state. This is just a quick 5 minute workaround!
  const numSent: number = sentCache.get(server.id) ?? 0;
  if (numSent >= 3) {
    return;
  }
  sentCache.set(server.id, numSent + 1);

  try {
    const { name, email_address: to } = await getUser(server.account_id);
    if (!to) {
      throw Error(
        `User ${server.account_id} has no email address, so we can't email them.`,
      );
    }
    const projectTitle = await getProjectTitle(server.project_id);
    const { site_name: siteName } = await getServerSettings();
    const subject = `${siteName}: Low Balance - ${action}`;
    const body = `
Hello ${name},

Your Compute Server '${server.title}' (Id: ${server.project_specific_id}) is
hitting your ${service} quota, or you are very low on funds.

- Action Taken: ${action}

- ${callToAction}

- [Compute Servers in your project "${projectTitle}"](${await siteURL()}/projects/${server.project_id}/servers)

${await support()}
`;

    await send({ to_ids: [server.account_id], subject, body });
  } catch (err) {
    logger.debug("updatePurchase: WARNING -- error notifying user -- ", err);
  }
}

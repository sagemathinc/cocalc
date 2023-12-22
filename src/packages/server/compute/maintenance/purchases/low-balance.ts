import getLogger from "@cocalc/backend/logger";
import { deprovision, stop } from "@cocalc/server/compute/control";
import { isPurchaseAllowed } from "@cocalc/server/purchases/is-purchase-allowed";
import { setError } from "@cocalc/server/compute/util";
import sendEmail from "@cocalc/server/email/send-email";
import siteURL from "@cocalc/database/settings/site-url";
import getProjectTitle from "@cocalc/server/projects/get-title";
import { getServerSettings } from "@cocalc/database/settings";
import { getUser } from "@cocalc/server/purchases/statements/email-statement";
import TTLCache from "@isaacs/ttlcache";

// turn VM off if you don't have at least this much left.
const COST_THRESH_DOLLARS = 2;

// If can't buy -- even if you increase all quotas and balance by
// this amount -- then delete.  This is to avoid bad situations, e.g.,
// buy 50TB of expensive disk, turn machine off, get a huge bill.
const DELETE_THRESH_MARGIN = 20;

const logger = getLogger("server:compute:maintenance:purchase:low-balance");

export default async function lowBalance({ server }) {
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
  // is it just bad, or REALLY bad?
  const x = await isPurchaseAllowed({
    account_id: server.account_id,
    service,
    cost: COST_THRESH_DOLLARS,
    margin: DELETE_THRESH_MARGIN,
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
  } else {
    action = "Computer Server Turned Off";
    callToAction = `Add credit to your account, so your compute server isn't deleted.`;
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
    const { help_email: from, site_name: siteName } = await getServerSettings();
    const subject = `Low Balance - ${action}`;
    const html = `
Hello ${name},

<br/>
<br/>

Your Compute Server '${server.title}' (Id: ${server.id}) is
hitting your ${service} quota, or you are too low on funds.
<br/>
<br/>
Action: ${action}
<br/>
<br/>
<b>${callToAction}</b>
<br/>
<br/>


<ul>
<li>
<a href="${await siteURL()}/settings/purchases">Add credit to your account
and see all of your purchases</a>
</li>
<li>
<a href="${await siteURL()}/projects/${server.project_id}/servers">Compute
  Servers in your project ${projectTitle}</a>
</li>
</ul>

If you have any questions, reply to this email to create a support request.
<br/>
<br/>

  -- ${siteName}
`;

    const text = `
Hello ${name},

Your Compute Server '${server.title}' (Id: ${server.id}) is
hitting your ${service} quota, or you are too low on funds.

Action Taken: ${action}

${callToAction}

Add credit to your account and see all of your purchases:

${await siteURL()}/settings/purchases

Compute Servers in your project ${projectTitle}

${await siteURL()}/projects/${server.project_id}/servers

If you have any questions, reply to this email to create a support request.

  -- ${siteName}
`;

    await sendEmail({ from, to, subject, html, text });
  } catch (err) {
    logger.debug("updatePurchase: WARNING -- error notifying user -- ", err);
  }
}

import getLogger from "@cocalc/backend/logger";
import { deprovision, stop } from "@cocalc/server/compute/control";
import { isPurchaseAllowed } from "@cocalc/server/purchases/is-purchase-allowed";
import { setError } from "@cocalc/server/compute/util";
import sendEmail from "@cocalc/server/email/send-email";
import siteURL from "@cocalc/database/settings/site-url";
import getProjectTitle from "@cocalc/server/projects/get-title";
import { getServerSettings } from "@cocalc/database/settings";
import { getUser } from "@cocalc/server/purchases/statements/email-statement";

// turn VM off if you don't have at least this much extra:
const COST_THRESH_DOLLARS = 2.5;

// If can buy even if you increase all quotas and balance by
// this much, then delete.  This is to avoid bad situations, e.g.,
// buy 50TB of expensive disk, turn machine off, get a huge bill.
const DELETE_THRESH_MARGIN = 20;

const logger = getLogger("server:compute:maintenance:purchase:low-balance");

export default async function lowBalance({
  allPurchases,
  server,
}) {
  if (!(await checkAllowed(0, "compute-server", server))) {
    return;
  }

  // add up all of the partial costs that haven't been committed
  // to the users transactions yet.
  let cost = 0; // this is just network usage.
  for (const purchase of allPurchases) {
    if (purchase.cost != null || purchase.period_end != null) {
      // not a concern since it got closed above
      continue;
    }
    if (purchase.service == "compute-server") {
      // nothing to do -- this is already included in the balance that
      // isPurchaseAllowed uses
    } else if (
      purchase.service == "compute-server-network-usage" &&
      purchase.description.type == "compute-server-network-usage"
    ) {
      // right now usage based metered usage isn't included in the balance
      // in src/packages/server/purchases/get-balance.ts
      // When that changes, we won't need this loop at all.
      cost += purchase.description.cost;
    }
  }
  await checkAllowed(cost, "compute-server-network-usage", server);
}

async function checkAllowed(cost: number, service, server) {
  let allowed,
    reason,
    alsoDelete = false;
  ({ allowed, reason } = await isPurchaseAllowed({
    account_id: server.account_id,
    service,
    cost: cost + COST_THRESH_DOLLARS,
  }));

  if (allowed) {
    // normal purchase is allowed - we're good
    return true;
  }
  // is it just bad, or REALLY bad?
  const x = await isPurchaseAllowed({
    account_id: server.account_id,
    service,
    cost: cost + COST_THRESH_DOLLARS,
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

async function notifyUser({ server, service, action, callToAction }) {
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

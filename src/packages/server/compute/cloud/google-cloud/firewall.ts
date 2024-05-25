/*
This allows 22,80,443 and UDP 51820 from the outside world.

TODO/SECURITY: We could also block all traffic from all other projects
on the internal network as an extra security precaution, just in
case.  That willl be easier to do once we have our VPN fully in place.
This is why tags and firewalls are plural below even though there
is only one.
*/

import { getCredentials } from "./client";
import getLogger from "@cocalc/backend/logger";
import { FirewallsClient } from "@google-cloud/compute";
import { getGoogleCloudPrefix } from "./index";

const logger = getLogger("server:compute:google-cloud:firewall");

export async function getDefaultFirewallTags() {
  return [`${await getGoogleCloudPrefix()}-default`];
}

let defaultFirewallKnownToExist = 0;
export async function ensureDefaultFirewallsExists() {
  logger.debug("ensure default firewall exists");
  const defaultFirewallName = `${await getGoogleCloudPrefix()}-default`;
  if (Date.now() - defaultFirewallKnownToExist < 1000 * 5 * 60) {
    logger.debug("ensure default firewall exists -- already known to exist");
    return;
  }

  const credentials = await getCredentials();
  const client = new FirewallsClient(credentials);
  try {
    await client.get({
      firewall: defaultFirewallName,
      project: credentials.projectId,
    });
    defaultFirewallKnownToExist = Date.now();
    return;
  } catch (err) {
    if (err.message.includes("not found")) {
      logger.debug(
        `ensure default firewall exists -- ${defaultFirewallName} does not exist, so creating it`,
      );
    } else {
      // network or auth error?
      throw err;
    }
  }

  const firewallResource = {
    allowed: [
      {
        IPProtocol: "tcp",
        ports: ["22", "80", "443"],
      },
      {
        IPProtocol: "udp",
        ports: ["51820"],
      },
    ],
    description: "CoCalc compute server default external firewall rule",
    direction: "INGRESS",
    disabled: false,
    enableLogging: false,
    kind: "compute#firewall",
    logConfig: {
      enable: false,
    },
    name: defaultFirewallName,
    network: `projects/${credentials.projectId}/global/networks/default`,
    priority: 800,
    selfLink: `projects/${credentials.projectId}/global/firewalls/${defaultFirewallName}`,
    sourceRanges: ["0.0.0.0/0"],
    targetTags: await getDefaultFirewallTags(),
  };
  await client.insert({
    project: credentials.projectId,
    firewallResource,
  });
  defaultFirewallKnownToExist = Date.now();
  // there is no worry about a race condition because the VM just gets a label
  // and the firewall then applies to it when it is actually created.
  logger.debug("ensure default firewall exists -- finished making request");
}

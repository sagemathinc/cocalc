/*

COCALC_SERVICE

*/

import { delay } from "awaiting";
import { lookup } from "dns/promises";
import { hostname } from "node:os";

import { getLogger } from "@cocalc/backend/logger";
import port from "@cocalc/backend/port";
import type { ConatServer } from "@cocalc/conat/core/server";
import { getAddressesFromK8sApi } from "./dns-scan-k8s-api";

export const SCAN_INTERVAL = 15_000;

export type PodInfos = { name: string; podIP: string }[];

const logger = getLogger("conat:socketio:dns-scan");

export async function dnsScan(server: ConatServer) {
  logger.debug("starting dnsScan");
  await delay(3000);
  while (server.state != "closed") {
    try {
      const addresses = new Set(await getAddresses());
      logger.debug("DNS found", addresses);

      const current = new Set(server.clusterAddresses());
      logger.debug("Current cluster", current);
      for (const address of current) {
        if (address == server.address()) {
          continue;
        }

        if (!addresses.has(address)) {
          if (server.state == ("closed" as any)) return;
          try {
            await server.unjoin({ address });
          } catch (err) {
            logger.debug(`WARNING: error unjoining to ${address} -- ${err}`);
          }
        }
      }

      for (const address of addresses) {
        if (current.has(address)) {
          continue;
        }
        logger.debug("joining", address);
        if (server.state == ("closed" as any)) return;
        try {
          await server.join(address);
        } catch (err) {
          logger.debug(`WARNING: error joining to ${address} -- ${err}`);
        }
      }
    } catch (err) {
      logger.debug(`WARNING: error doing dns scan -- ${err}`);
    }
    await delay(SCAN_INTERVAL);
  }
}

export async function localAddress(): Promise<string> {
  const { address } = await lookup(hostname());
  return address;
}

/*

hub@hub-conat-router-5cbc9576f-44sl2:/tmp$ hostname
hub-conat-router-5cbc9576f-44sl2

# figured this out by reading the docs at https://kubernetes.io/docs/reference/kubectl/jsonpath/

hub@hub-conat-router-5cbc9576f-44sl2:/tmp$ kubectl get pods -l run=hub-conat-router -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.podIP}{"\n"}{end}'
hub-conat-router-5cbc9576f-44sl2        192.168.39.103
hub-conat-router-5cbc9576f-n99x7        192.168.236.174
*/

export async function getAddresses(): Promise<string[]> {
  const v: string[] = [];
  const h = hostname();
  const i = h.lastIndexOf("-");
  const prefix = h.slice(0, i);

  const podInfos: PodInfos = await getAddressesFromK8sApi();
  for (const { name, podIP } of podInfos) {
    if (name != h && name.startsWith(prefix)) {
      v.push(`http://${podIP}:${port}`);
    }
  }
  return v;
}

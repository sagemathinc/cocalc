/*
Request/response API that runs in each browser client.

DEVELOPMENT:

Refresh your browser and do this in the console to connect to your own browser:

    > a = cc.client.nats_client.browserApi({sessionId:cc.client.nats_client.sessionId})

Then try everything.

You can also open a second browser tab (with the same account), view the sessionId

    > cc.client.nats_client.sessionId

then connect from one to the other using that sessionId.  This way you can coordinate
between different browsers.
*/

import { type System, system } from "./system";
import { handleErrorMessage } from "@cocalc/nats/util";

export interface BrowserApi {
  system: System;
}

const BrowserApiStructure = {
  system,
} as const;

export function initBrowserApi(callBrowserApi): BrowserApi {
  const browserApi: any = {};
  for (const group in BrowserApiStructure) {
    if (browserApi[group] == null) {
      browserApi[group] = {};
    }
    for (const functionName in BrowserApiStructure[group]) {
      browserApi[group][functionName] = async (...args) =>
        handleErrorMessage(
          await callBrowserApi({
            name: `${group}.${functionName}`,
            args,
          }),
        );
    }
  }
  return browserApi as BrowserApi;
}

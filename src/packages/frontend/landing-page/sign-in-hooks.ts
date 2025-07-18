/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* This is currently only used to store the answer to the user sign up question
   about where they found out about cocalc.
*/

import { webapp_client } from "../webapp-client";
import * as LS from "../misc/local-storage-typed";
import { SignedIn } from "@cocalc/util/message-types";
import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

async function tracking_events(): Promise<void> {
  if (localStorage == null) return;

  for (const event of ["sign_up_how_find_cocalc"]) {
    const value = LS.get<object>(event);
    if (value != null) {
      LS.del(event);
      webapp_client.tracking_client.user_tracking(event, value);
    }
  }
}

async function analytics_send(mesg: SignedIn): Promise<void> {
  window
    .fetch(join(appBasePath, "analytics.js"), {
      method: "POST",
      cache: "no-cache",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      redirect: "follow",
      body: JSON.stringify({
        account_id: mesg.account_id,
      }),
    })
    // .then(response => console.log("Success:", response))
    .catch((error) =>
      console.log("WARNING: sign-in-hooks::analytics_send error:", error),
    );
}

// Launch actions step 1: store any launch action information
import * as launch_actions from "../launch/actions";
launch_actions.store();

webapp_client.on("signed_in", (mesg: SignedIn) => {
  // console.log("sign-in-hooks::signed_in mesg=", mesg);
  // these run in parallel
  tracking_events();
  // launch actions step 2: launch based on local storage
  launch_actions.launch();
  analytics_send(mesg);
});

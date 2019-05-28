/* This is currently only used to store the answer to the user sign up question
   about where they found out about cocalc.
*/

const { webapp_client } = require("../webapp_client");
import * as LS from "misc/local-storage";
const { APP_BASE_URL } = require("../misc_page");
import { SignedIn } from "../../smc-util/message-types";

async function tracking_events(): Promise<void> {
  if (localStorage == null) return;

  for (const event of ["sign_up_how_find_cocalc"]) {
    const value = localStorage[event];
    if (value != null) {
      LS.del(event);
      webapp_client.user_tracking({ event, value });
    }
  }
}

async function analytics_send(mesg: SignedIn): Promise<void> {
  const xhr = new XMLHttpRequest();
  xhr.open("POST", APP_BASE_URL + "/analytics.js", true);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.send(
    JSON.stringify({
      account_id: mesg.account_id
    })
  );
}

webapp_client.on("signed_in", (mesg: SignedIn) => {
  console.log("sign-in-hooks::signed_in mesg=", mesg);
  // these run in parallel
  tracking_events();
  analytics_send(mesg);
});

/* Provide a typescript-friendly stable interface to user_tracking, so
   client code doesn't have to import smc_webapp everywhere, and we can
   completely change this if we want. */

import { callback2 } from "smc-util/async-utils";

// This function should never raise an exception -- instead it
// shows a warning in the console.
export async function user_tracking(event: string, value: any): Promise<void> {
  console.log("user_tracking", event, value);
  const { webapp_client } = require("./webapp_client");
  if (webapp_client == null) {
    console.warn("webapp_client not available");
    return;
  }
  try {
    callback2(webapp_client.user_tracking, { event, value });
  } catch (err) {
    console.warn("user_tracking", err);
  }
}

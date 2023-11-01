/*
Update the purchase status for the compute server.

The purchase is likely to change if the state changes.
It can also change when the VM is off but the disk size changes.
Also, we have to update purchases periodically so they don't
last more than one day.

PAINFUL ASSUMPTION here -- the function updatePurchase could be called
frequently possibly simultaneously about the same compute server,
from several different hub servers connected to the same database.
This means it has to be very cogniscient of load and race conditions.
Here's how we solve this:

- There's a field in the database in the compute_servers table that just
says "update purchasing for this compute server".  It's basically a flag
saying "pay attention to me".

- There is exactly one server where all udpates to the database involving
purchases actually happens. That's done in a frequent maintenance loop.
This avoids any possibility of race conditions.  We can also handle
many compute servers in parallel (since there is no race across different
servers) for speed, if necessary.

*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import type {
  ComputeServer,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import {
  getTargetState,
  STATE_INFO,
} from "@cocalc/util/db-schema/compute-servers";
const logger = getLogger("server:compute:update-purchase");

// This marks the compute server in the database in some cases to say
// "heh, better check on purchases for this compute server soon". That's
// all this does, and it is safe to call frequently.
export default async function updatePurchase({
  server,
  newState: newState0,
}: {
  server: ComputeServer;
  newState: State;
}) {
  if (newState0 != "starting" && !STATE_INFO[newState0]?.stable) {
    // don't change purchase while in non-stable states, except starting (since cloud
    // providers charge us right when machine begins starting)
    return;
  }
  const newState = getTargetState(newState0);
  if (newState == "deprovisioned" && server.purchase_id == null) {
    // nothing to do -- purchase already cleared
    // This is an unlikely special case, but might as well...
    return;
  }

  logger.debug(
    "update purchase -- marking compute server as being in need of update:",
    { server_id: server.id, newState },
  );
  const pool = getPool();
  await pool.query(
    "UPDATE compute_servers SET update_purchase=TRUE WHERE id=$1",
    [server.id],
  );
}

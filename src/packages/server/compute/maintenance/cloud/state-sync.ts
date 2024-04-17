/*
Periodicaly make sure "reality" is in sync with what we believe about VM's in the database.

In particular, for each compute server, we would like the state to be correct.
A dumb way to do this would be to just ping the cloud provider every 30 seconds
for every compute server in our database, and save the results.  Obviously that
is really dumb.  So we have to work harder.

The first important thing is that when running and AFTER booting up, each compute
server pings cocalc about once every 30 seconds.  This is done in
packages/server/compute/cloud/startup-script.ts
near the end, where this line gets repeatedly called: "setState vm ready '' 35 100"
The first argument is how long the ready start report is supposed to be considered
valid, so we can take that into account.

So here is what we are going to do for now. We only need to support Google
cloud via OUR api key for now, since onprem is free, and onprem is the only
other thing we support.  Later, when users have their own api keys, etc., things
will be complicated.

In google cloud, we don't have to worry about something starting a machine that
is off or suspended, so we will just assume that doesn't happen.  What we do
have to worry about:

 - a running spot instance machine turning off
 - a suspended VM turning off, due to exceeding the 60 day limit
 - a user just turning any machine off themself by typing, e.g., "sudo shutdown -h now".

Strategy to deal with this:

- Before we start getting ready pings from any running server, we check every 30s that it is running.
- Once we start getting ready pings, we check state of any server that is supposed to be running,
  but hasn't sent a ready ping for (ready_validity_time + 10s), which is basically 45s right now.
- We check state once per hour for all suspended VM's that have been suspended for at least 60 days.
- We check state every 30s of any server that had state shift to off within the last 5 minutes, because
  if user reboots the server, then it would go from running to off to starting again, and we don't want
  to miss that and not charge them.

Here we are merely *checking* the state.  The possible actions this causes:
- change in the amount they are charged
- later: spot instances get automatically started again.

Actually, we could simplify the above by checking state in exactly the following situations:

- 'suspended' compute servers where last state change was 60 days ago: once per hour
- 'off' compute servers, where last state change was within 5 minutes: once per 30s
- any unstable state: 'starting','stopping','suspending' within up to 30 minutes; once per 30s
- 'running' compute servers with no valid vm 'ready' state: once per 30s

All of the above should be efficient database queries.
*/
import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { state } from "@cocalc/server/compute/control";
import { mapParallelLimit } from "@cocalc/util/async-utils";

const logger = getLogger("server:compute:maintenance:cloud:state-sync");

const lastChecked: { [id: number]: number } = {};

export default async function stateSync() {
  // Query database for all compute servers that are either 'suspended' for at least 60 days,
  // or 'off' with last state change within 5 minutes, or 'running' with no valid ready ping.
  // We skip on prem for now since (1) it is free, and (2) we have no way to fetch the state.
  // We also don't look at servers whose state changed in the last minute, since that destabilizes
  // properly managed cloud operations.
  const pool = getPool();
  const { rows: servers } = await pool.query(
    `SELECT id, state, account_id FROM compute_servers WHERE cloud != 'onprem'
      AND  state_changed + interval '1 minute' <= NOW()
      AND ( (state='suspended' AND state_changed + interval '60 days' <= NOW())
         OR (state='off'   AND state_changed + interval '5 minutes' >= NOW())
         OR (state=ANY('{starting,stopping,suspending}') AND state_changed + interval '30 minutes' >= NOW())
         OR (state='running'   AND COALESCE((detailed_state#>'{vm,expire}')::numeric, 0) < 1000*extract(epoch from now())))`,
  );
  logger.debug(
    `got ${servers.length} compute servers with potentially invalid state`,
  );
  const v: { id; account_id; state }[] = [];
  for (const x of servers) {
    const last = lastChecked[x.id];
    const now = Date.now();
    if (last != null) {
      if (x.state == "suspended" && now - last <= 1000 * 60 * 60) {
        continue;
      }
      if (now - last <= 1000 * 30) {
        continue;
      }
    }
    v.push(x);
  }
  await mapParallelLimit(v, checkState, 10);
}

async function checkState(x) {
  lastChecked[x.id] = Date.now();
  try {
    const realState = await state({ ...x, maintenance: true });
    logger.debug("checkState", x, `realState=${realState}`);
  } catch (err) {
    logger.debug("checkState", x, `error: ${err}`);
  }
}

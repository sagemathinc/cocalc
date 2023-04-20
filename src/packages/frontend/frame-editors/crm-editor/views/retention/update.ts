/*
The variables start, stop and dataEnd are Date objects.
The cohort duration is stop - start.
We consider intervals [start + n*duration, stop + n*duration]
for each value of n = 0, 1, 2, ... up to when stop + n*duration is at most dataEnd.

For each such interval we run a database query and also call the
onProgress function with a string describing what is happening
and the second argument the percentage complete.
*/

import type { Retention } from "../retention";
import { webapp_client } from "@cocalc/frontend/webapp-client";

export default async function update(
  { model, start, stop, period, dataEnd = new Date() }: Retention,
  setCancelRef,
  onProgress: (string, percentDone) => void
): Promise<void> {
  start = new Date(start);
  stop = new Date(stop);
  dataEnd = new Date(dataEnd);
  let cancel = false;
  setCancelRef.current = () => {
    cancel = true;
  };
  const totalDuration = dataEnd.getTime() - start.getTime();
  const cohortDuration = stop.getTime() - start.getTime();

  let n = 0;
  let intervalStart = start;
  let intervalStop = stop;
  let progress = 0;
  let last = "";

  while (intervalStop.getTime() <= dataEnd.getTime() && !cancel) {
    const interval = `[${intervalStart.toLocaleDateString()}, ${intervalStop.toLocaleDateString()})`;

    // Update progress
    const soFarDuration = intervalStop.getTime() - start.getTime();
    progress = Math.round((soFarDuration / totalDuration) * 100);
    onProgress(
      `${
        last ? "Got " + last + ". " : ""
      }Processing cohort interval ${interval}...`,
      progress
    );

    // Query the database for the current cohort interval
    const result = await webapp_client.async_query({
      query: {
        crm_retention: {
          start: intervalStart,
          stop: intervalStop,
          model,
          period,
          size: null, // make it a get query -- this triggers updating the data
          active: null,
        },
      },
    });
    last = JSON.stringify(result.query.crm_retention);

    // Update interval for next iteration
    n += 1;
    intervalStart = new Date(start.getTime() + n * cohortDuration);
    intervalStop = new Date(stop.getTime() + n * cohortDuration);
  }
  if (cancel) {
    onProgress("Canceled!", progress);
    return;
  }
  onProgress("Complete", 100);
}

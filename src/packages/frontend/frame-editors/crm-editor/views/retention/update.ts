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
import { startOfDayUTC } from "./util";
import dayjs from "dayjs";
import LRU from "lru-cache";

const FAKE_DATA = false;

const cache = new LRU<string, Data[]>({ max: 50 });

export interface Data {
  start: Date;
  stop: Date;
  model: string;
  period: object;
  size: number;
  active: number[];
  last_start_time: Date;
}

export default async function update(
  { model, start, stop, period, dataEnd = new Date() }: Retention,
  setCancelRef,
  onProgress: (string, percentDone) => void,
  cacheOnly?: boolean,
): Promise<Data[] | null> {
  start = startOfDayUTC(start);
  stop = startOfDayUTC(dayjs(stop).add(1, "day"));
  dataEnd = startOfDayUTC(dataEnd);
  const key = JSON.stringify({ model, start, stop, period, dataEnd });
  if (cache.has(key)) {
    return cache.get(key) as Data[];
  }
  if (cacheOnly) {
    return null;
  }

  const data: Data[] = [];
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
      progress,
    );

    // Query the database for the current cohort interval
    const result = await webapp_client.async_query({
      timeout: 2 * 60000, // it can take a while when there is a lot of data.
      query: {
        crm_retention: {
          start: intervalStart,
          stop: intervalStop,
          model,
          period,
          size: null, // make it a get query -- this triggers updating the data
          active: null,
          last_start_time: null,
        },
      },
    });
    last = JSON.stringify(result.query.crm_retention);
    if (FAKE_DATA) {
      const size = (result.query.crm_retention.size = Math.round(
        Math.random() * 1000,
      ));
      let n = size * Math.random();
      result.query.crm_retention.active = result.query.crm_retention.active.map(
        (_) => {
          n = Math.min(size, Math.round(n * 1.3 * Math.random()));
          return n;
        },
      );
    }
    if (result.query.crm_retention != null) {
      data.push(result.query.crm_retention);
    }

    // Update interval for next iteration
    n += 1;
    intervalStart = new Date(start.getTime() + n * cohortDuration);
    intervalStop = new Date(stop.getTime() + n * cohortDuration);
    if (model.endsWith(":all")) {
      // we only need to do it for one "cohort" since that cohort is all users.
      break;
    }
  }
  if (cancel) {
    onProgress("Canceled!", progress);
  } else {
    onProgress("Complete", 100);
    cache.set(key, data);
  }
  return data;
}

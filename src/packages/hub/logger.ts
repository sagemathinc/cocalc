/*
Winston logger for a hub server.

There is a similar logger, but with different parameters, in packages/project.
*/

import { getLogger } from "@cocalc/backend/logger";

// either way:
export { getLogger };
export default getLogger;

import { setCounter } from "@cocalc/backend/logger";

import { new_counter } from "@cocalc/server/metrics/metrics-recorder";

// one metric for all WinstonMetrics instances (instead, they have a name and the level!)
const counter = new_counter(
  "log_lines_total",
  "counts the number of printed log lines",
  ["name", "level"],
);

setCounter(counter);

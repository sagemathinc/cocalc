/*
Winston logger for a hub server.

There is a similar logger, but with different parameters, in smc-project.
*/

import { getLogger } from "smc-util-node/logger";

// either way:
export { getLogger };
export default getLogger;

import { setCounter } from "smc-util-node/logger";

const metrics_recorder = require("./metrics-recorder");

// one metric for all WinstonMetrics instances (instead, they have a name and the level!)
const counter = metrics_recorder.new_counter(
  "log_lines_total",
  "counts the number of printed log lines",
  ["name", "level"]
);

setCounter(counter);

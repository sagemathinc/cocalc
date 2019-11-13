import chalk from "chalk";
import { PassFail } from "./types";
const sprintf = require("sprintf-js").sprintf;

export const time_log = function(desc: string, start: bigint): void {
  const elapsed: bigint = process.hrtime.bigint() - start;
  console.log(
    chalk.green(
      sprintf("%32s: %7.3f sec", desc, Number(elapsed) / 1000000000.0)
    )
  );
};

export const pf_log = function(pf: PassFail): void {
  console.log(chalk.green(sprintf("%32s: %3d", "passed", pf.pass)));
  console.log(chalk.green(sprintf("%32s: %3d", "failed", pf.fail)));
  console.log(chalk.green(sprintf("%32s: %3d", "skipped", pf.skip)));
};

export const num_log = function(msg: string, num: number): void {
  console.log(chalk.green(sprintf("%32s: %3d", msg, num)));
};

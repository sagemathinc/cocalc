/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import chalk from "chalk";
import { PassFail } from "./types";
const sprintf = require("sprintf-js").sprintf;

import { existsSync, promises } from "fs";
import { Creds, Opts } from "./types";

export const time_log = function (desc: string, start: bigint): void {
  const elapsed: bigint = process.hrtime.bigint() - start;
  console.log(chalk.green(sprintf("%32s: %7.3f sec", desc, Number(elapsed) / 1000000000.0)));
};

export const time_log2 = async function (desc: string, start: bigint, creds: Creds, opts: Opts): Promise<void> {
  const elapsed: bigint = process.hrtime.bigint() - start;
  const sec_elapsed: Number = Number(elapsed) / 1000000000.0;
  console.log(chalk.green(sprintf("%32s: %7.3f sec", desc, sec_elapsed)));

  const csv_hdr: string = "datetime,seconds,site,action\n";
  if (!existsSync(opts.csv_log)) {
    await promises.writeFile(opts.csv_log, csv_hdr, { encoding: "utf8", flag: "w" });
  }

  const csv_out = `${new Date().toISOString()},${sec_elapsed},${creds.sitename},${desc}\n`;
  await promises.writeFile(opts.csv_log, csv_out, { encoding: "utf8", flag: "a" });
};

export const pf_log = function (pf: PassFail): void {
  console.log(chalk.green(sprintf("%32s: %3d", "passed", pf.pass)));
  console.log(chalk.green(sprintf("%32s: %3d", "failed", pf.fail)));
  console.log(chalk.green(sprintf("%32s: %3d", "skipped", pf.skip)));
};

export const num_log = function (msg: string, num: number): void {
  console.log(chalk.green(sprintf("%32s: %3d", msg, num)));
};

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import chalk from "chalk";
import { Opts } from "./types";
import { Page } from "puppeteer";

const screenshot = async function (page: Page, opts: Opts, spath: string): Promise<void> {
  if (opts.screenshot) {
    try {
      await page.screenshot({ path: spath });
      console.log(chalk.blue(`screenshot saved to ${spath}`));
    } catch (e) {
      console.log(chalk.red(`SCREENSHOT ERROR: ${e.message}`));
    }
  }
};

export default screenshot;

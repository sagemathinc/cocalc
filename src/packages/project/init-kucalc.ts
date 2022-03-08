/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { options } from "./init-program";
const kucalc = require("./kucalc");
import * as projectSetup from "./project-setup";
import { activate as initAutorenice } from "./autorenice";
import * as dedicatedDisks from "./dedicated-disks";
import { getLogger } from "./logger";

export default async function init() {
  const winston = getLogger("init kucalc");
  winston.info("initializing state related to KuCalc");
  if (options.kucalc) {
    winston.info("running in kucalc");
    kucalc.IN_KUCALC = true;

    if (options.testFirewall) {
      kucalc.init_gce_firewall_test(winston);
    }
  } else {
    winston.info("NOT running in kucalc");
    kucalc.IN_KUCALC = false;
  }

  if (process.env.COCALC_PROJECT_AUTORENICE != null || options.kucalc) {
    initAutorenice();
  }

  projectSetup.configure();
  projectSetup.set_extra_env();
  await dedicatedDisks.init();
}

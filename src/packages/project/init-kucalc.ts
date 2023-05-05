/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { activate as initAutorenice } from "./autorenice";
import * as dedicatedDisks from "./dedicated-disks";
import { getOptions } from "./init-program";
import * as initScript from "./init-script";
import { init as initJupyterPool } from "./jupyter/pool";
import { init as initJupyterPoolParams } from "./jupyter/pool-params";
import * as kucalc from "./kucalc";
import { getLogger } from "./logger";
import * as projectSetup from "./project-setup";
import * as sshd from "./sshd";

export default async function init() {
  const winston = getLogger("init kucalc");
  const options = getOptions();
  winston.info("initializing state related to KuCalc");
  if (options.kucalc) {
    winston.info("running in kucalc");
    kucalc.setInKucalc(true);

    if (options.testFirewall) {
      kucalc.init_gce_firewall_test(winston);
    }
  } else {
    winston.info("NOT running in kucalc");
    kucalc.setInKucalc(false);
  }

  if (process.env.COCALC_PROJECT_AUTORENICE != null || options.kucalc) {
    initAutorenice();
  }

  projectSetup.configure();
  const envVars = projectSetup.set_extra_env();

  if (options.sshd) {
    sshd.init(envVars);
  }

  // this must come after projectSetup.set_extra_env !
  initJupyterPoolParams();

  await dedicatedDisks.init();

  initScript.run();

  // this has to come after setting env vars and intializing the pool params
  initJupyterPool();
}

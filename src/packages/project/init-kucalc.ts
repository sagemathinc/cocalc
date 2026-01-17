/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { activate as initAutorenice } from "./autorenice";
import { getOptions } from "./init-program";
import * as initScript from "./init-script";
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

  initScript.run();
}

import { options } from "./init-program";
const kucalc = require("./kucalc");
import * as projectSetup from "./project-setup";
import { activate as initAutorenice } from "./autorenice";

export default function init() {
  if (options.kucalc) {
    winston.info("running in kucalc");
    kucalc.IN_KUCALC = true;
    projectSetup.cleanup();

    if (options.testFirewall) {
      kucalc.init_gce_firewall_test(winston);
    }
  } else {
    winston.info("NOT running in kucalc");
    kucalc.IN_KUCALC = false;
  }

  if (process.env.COCALC_PROJECT_AUTORENICE != null || options.kucalc) {
    initAutorenice(process.env.COCALC_PROJECT_AUTORENICE);
  }

  // this is only relevant for kucalc
  projectSetup.configure();
  projectSetup.set_extra_env();
}

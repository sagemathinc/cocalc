const crash = require("./crash.html").default;
import { HELP_EMAIL } from "smc-util/theme";

export function init() {
  // adding a banner in case react crashes (it will be revealed)
  $("body").append(crash.replace(/HELP_EMAIL/g, HELP_EMAIL));
}

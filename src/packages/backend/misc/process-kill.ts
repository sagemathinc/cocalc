import getLogger from "@cocalc/backend/logger";
const winston = getLogger("process-kill");

// sends kill 2,3,9 signal to pid.
// never raises an exception.
export default function processKill(pid: number, signal: 2 | 3 | 9) {
  let s;
  switch (signal) {
    case 2:
      s = "SIGINT";
      break;
    case 3:
      s = "SIGQUIT";
      break;
    case 9:
      s = "SIGKILL";
      break;
    default:
      winston.debug(
        "WARNING -- process_kill: only signals 2 (SIGINT), 3 (SIGQUIT), and 9 (SIGKILL) are supported"
      );
      return;
  }
  try {
    process.kill(pid, s);
  } catch (_err) {}
}

// it's normal to get an exception when sending a signal... to a process that doesn't exist.

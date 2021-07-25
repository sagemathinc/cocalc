import { getLogger } from "./logger";

let bugCount: number = 0;

export function init() {
  const winston = getLogger("BUG (uncaughtException)");
  process.addListener("uncaughtException", (err) => {
    bugCount += 1;
    const border = `BUG (count=${bugCount}) ****************************************************************************`;
    winston.debug(border);
    winston.debug(`Uncaught exception: ${err}`);
    winston.debug(err.stack);
    winston.debug(border);
    console?.trace?.();
  });
}

export default function getBugCount(): number {
  return bugCount;
}

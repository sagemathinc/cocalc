import writeFile from "fs";
import callback from "delay";

import { serverPidFile } from "smc-project/data";

export default async function init() {
  await callback(writeFile, serverPidFile, `${process.pid}`);
}

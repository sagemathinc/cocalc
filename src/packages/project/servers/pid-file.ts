import { writeFile } from "fs";
import { callback } from "awaiting";

import { projectPidFile } from "@cocalc/project/data";

export default async function init() {
  await callback(writeFile, projectPidFile, `${process.pid}`);
}

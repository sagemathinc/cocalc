/*
Responsible for creating the info.json file that's in the
temporary store (e.g., ~/.smc) for the project.  It is used
by various scripts and programs to get basic information
about the project.
*/

import { networkInterfaces } from "os";
import { getLogger } from "./logger";
import { infoJson, project_id, username } from "./data";
import { is_valid_uuid_string } from "smc-util/misc";
import { program } from "./init-program";
import { basePath } from "smc-util-node/base-path";

let INFO: {
  project_id: string;
  location: { host: string; username: string };
  basePath: string;
};

export { INFO };

export default async function init() {
  const winston = getLogger("info-json init");
  winston.info("initializing the info.json file...");
  let host: string;
  if (process.env.HOST != null) {
    host = process.env.HOST;
  } else if (program.kucalc) {
    // what we want for the Google Compute engine deployment
    // earlier, there was eth0, but newer Ubuntu's on GCP have ens4
    const nics = networkInterfaces();
    const mynic = nics.eth0 ?? nics.ens4;
    host = mynic?.[0].address;
  } else {
    // for a single machine (e.g., cocalc-docker)
    host = "localhost";
  }
  INFO = {
    project_id,
    location: { host, username },
    basePath,
    base_url: basePath, // for backwards compat userspace code
  };
  await callback(fs.writeFile, infoJson, JSON.stringify(INFO));
  winston.info(`Successfully wrote "${infoJson}"`);
}

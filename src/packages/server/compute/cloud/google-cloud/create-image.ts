import type { ImageType } from "./images";
import { imageName, getImagesClient, Architecture } from "./images";
import getLogger from "@cocalc/backend/logger";
import createInstance from "./create-instance";
import { getSerialPortOutput, deleteInstance, stopInstance } from "./client";
import { installCuda, installDocker } from "../install";
import { delay } from "awaiting";
import getInstanceState from "./get-instance-state";
import type { GoogleCloudConfiguration } from "@cocalc/util/db-schema/compute-servers";

const logger = getLogger("server:compute:google-cloud:create-image");

interface Options {
  type: ImageType;
  tag?: string;
  noDelete?: boolean;
}

export async function createImage({
  type,
  tag = "",
  noDelete,
}: Options): Promise<string[]> {
  const names: string[] = [];
  for (const { configuration, startupScript, maxTimeMinutes, arch } of getConf(
    type,
  )) {
    logger.debug("createImage: create instance", {
      arch,
      configuration,
    });
    const name = imageName({ type, date: new Date(), tag, arch });
    let zone = "";
    try {
      zone = configuration.zone;
      await createInstance({
        name,
        configuration,
        startupScript,
        metadata: { "serial-port-logging-enable": true },
      });
      logger.debug("createImage: wait until startup script finishes");
      await waitForInstallToFinish({
        name,
        zone,
        maxTimeMinutes,
      });
      logger.debug("createImage: create image from instance");
      await createImageFromInstance({ zone, name });
    } finally {
      if (zone && !noDelete) {
        logger.debug("createImage: delete the instance no matter what");
        await deleteInstance({ zone, name });
      }
    }
    names.push(name);
  }
  return names;
}

interface BuildConfig {
  configuration: GoogleCloudConfiguration;
  startupScript: string;
  maxTimeMinutes: number;
  arch: Architecture;
}

function getConf(type: ImageType): BuildConfig[] {
  switch (type) {
    case "standard":
      return [createStandardConf_x86_64(), createStandardConf_arm64()];
    case "cuda":
      return [createCudaConf()];
    default:
      throw Error(`type ${type} not supported`);
  }
}

function createStandardConf_x86_64() {
  logger.debug("createStandardConf");
  const configuration = {
    cloud: "google-cloud",
    spot: true,
    zone: "us-east1-b",
    region: "us-east1",
    machineType: "c2-standard-4",
    metadata: { "serial-port-logging-enable": true },
    diskSizeGb: 20,
  } as const;
  const startupScript = `
#!/bin/bash
set -ev
${installDocker()}

docker pull sagemathinc/cocalc
docker pull sagemathinc/cocalc-python3

df -h /
`;
  return {
    configuration,
    startupScript,
    maxTimeMinutes: 10,
    arch: "x86_64",
  } as const;
}

function createStandardConf_arm64() {
  logger.debug("createStandardConf");
  const configuration = {
    cloud: "google-cloud",
    spot: true,
    region: "us-central1",
    zone: "us-central1-a",
    machineType: "t2a-standard-4",
    metadata: { "serial-port-logging-enable": true },
    diskSizeGb: 20,
  } as const;
  const startupScript = `
#!/bin/bash
set -ev
${installDocker()}

docker pull sagemathinc/cocalc
docker pull sagemathinc/cocalc-python3

df -h /

`;
  return {
    configuration,
    startupScript,
    maxTimeMinutes: 10,
    arch: "arm64",
  } as const;
}

function createCudaConf() {
  logger.debug("createCudaConf");
  const configuration = {
    cloud: "google-cloud",
    spot: true,
    zone: "us-east1-b",
    region: "us-east1",
    machineType: "c2-standard-4",
    diskSizeGb: 40,
  } as const;
  const startupScript = `
#!/bin/bash

${installDocker()}

docker pull sagemathinc/cocalc
docker pull sagemathinc/cocalc-python3
docker pull sagemathinc/cocalc-pytorch

${installCuda()}

df -h /
`;
  return {
    configuration,
    startupScript,
    maxTimeMinutes: 30,
    arch: "x86_64",
  } as const;
}

/*
Sep 12 05:03:21 cocalc-image-standard-20230912-044848-test google_metadata_script_runner[962]: startup-script exit status 0
Sep 12 05:03:21 cocalc-image-standard-20230912-044848-test google_metadata_script_runner[962]: Finished running startup scripts.
Sep 12 05:03:21 cocalc-image-standard-20230912-044848-test systemd[1]: google-startup-scripts.service: Deactivated successfully.
Sep 12 05:03:21 cocalc-image-standard-20230912-044848-test systemd[1]: Finished Google Compute Engine Startup Scripts.
Sep 12 05:03:21 cocalc-image-standard-20230912-044848-test systemd[1]: Startup finished in 1.124s (kernel) + 14.399s (userspace) = 15.524s.
Sep 12 05:03:21 cocalc-image-standard-20230912-044848-test systemd[1]: google-startup-scripts.service: Consumed 3.691s CPU time.
*/
async function waitForInstallToFinish({ zone, name, maxTimeMinutes }) {
  logger.debug("waitForInstallToFinish", { zone, name, maxTimeMinutes });
  const t0 = Date.now();
  let n = 3000;
  while (Date.now() - t0 <= maxTimeMinutes * 1000 * 60) {
    let log;
    try {
      log = await getSerialPortOutput({ name, zone });
    } catch (err) {
      log = `${err}`;
    }
    logger.debug("waitForInstallToFinish", log?.slice(-500));
    if (log != null) {
      const i = log.indexOf("startup-script exit status");
      if (i != -1) {
        const j = log.indexOf("\n", i);
        const exitCode = parseInt(
          log.slice(i + "startup-script exit status".length + 1, j).trim(),
        );
        if (exitCode == 0) {
          return;
        } else {
          throw Error(`failed! ${log.slice(i - 1000)}`);
        }
      }
    }
    n = Math.min(15000, n * 1.3);
    logger.debug("waiting ", n / 1000, "seconds...");
    await delay(n);
  }
  throw Error("timed out waiting for install to finish");
}

export async function createImageFromInstance({ zone, name }) {
  logger.debug("createImageFromInstance", { zone, name });
  if ((await getInstanceState({ zone, name })) != "off") {
    logger.debug("createImageFromInstance: stopping instance...");
    await stopInstance({ zone, name, wait: true });
  }
  logger.debug("createImageFromInstance: creating image");

  // https://cloud.google.com/compute/docs/images/create-custom#api_1
  const { client, projectId } = await getImagesClient();
  const imageResource = {
    name,
    sourceDisk: `/zones/${zone}/disks/${name}`,
  };
  logger.debug("create ", { imageResource });

  await client.insert({
    project: projectId,
    imageResource,
    forceCreate: true,
  });

  const t0 = Date.now();
  let n = 3000;
  while (Date.now() - t0 <= 1000 * 60 * 5) {
    const [response] = await client.list({
      project: projectId,
      maxResults: 1000,
      filter: `name:${imageResource.name}`,
    });
    if (response[0].status == "READY") {
      return;
    }
    n = Math.min(15000, n * 1.3);
    logger.debug("waiting ", n / 1000, "seconds for image to be created...");
    await delay(n);
  }
  throw Error(`image creation did not finish -- ${name}`);
}

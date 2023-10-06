/*
~/cocalc/src/packages/server$ node
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> 

a = require('./dist/compute/cloud/google-cloud/create-image')

await a.createImages({image:"python", arch:'arm64'})

a = require('./dist/compute/cloud/google-cloud/images')
{sourceImage} = await a.getNewestSourceImage({image:'python',test:true})
await a.setImageLabel({key:'prod',value:true, name:sourceImage})


// This just creates ALL images in parallel:
await a.createImages({})

// This labels *everything* that is not prod=true to instead have prod=true:
await a.labelSourceImages({filter:{prod:false}})

*/

import { imageName, getImagesClient, Architecture } from "./images";
import getLogger from "@cocalc/backend/logger";
import createInstance from "./create-instance";
import { getSerialPortOutput, deleteInstance, stopInstance } from "./client";
import { installCuda, installDocker, installUser } from "../install";
import { delay } from "awaiting";
import getInstance from "./get-instance";
import type {
  GoogleCloudConfiguration,
  ImageName,
} from "@cocalc/util/db-schema/compute-servers";
import {
  getMinDiskSizeGb,
  IMAGES,
} from "@cocalc/util/db-schema/compute-servers";
import { appendFile, mkdir } from "fs/promises";
import { join } from "path";

const logger = getLogger("server:compute:google-cloud:create-image");

interface Options {
  image?: ImageName;
  tag?: string;
  noDelete?: boolean;
  noParallel?: boolean;
  arch?: Architecture;
}

async function createAllImages(opts) {
  async function build(image) {
    return await createImages({ ...opts, image });
  }
  const t0 = Date.now();

  let names: string[] = [];
  if (opts.noParallel) {
    // serial
    for (const image in IMAGES) {
      names = names.concat(await build(image));
    }
  } else {
    for (const r of await Promise.all(Object.keys(IMAGES).map(build))) {
      names = names.concat(r);
    }
  }
  console.log("CREATED", names);
  console.log("DONE", (Date.now() - t0) / 1000 / 60, "minutes");
  return names;

  return names;
}

export async function createImages({
  image,
  tag = "",
  noDelete,
  noParallel,
  arch,
}: Options = {}): Promise<string[]> {
  if (image == null) {
    // create all types
    return await createAllImages({
      image,
      noDelete,
      noParallel,
      arch,
    });
  }

  if (image == null) {
    throw Error("bug -- image must not be null");
  }
  const onlyArch = arch;
  const t0 = Date.now();
  const names: string[] = [];
  const vms = new Set<string>();
  let maxTime = 0;
  try {
    async function build({
      image,
      configuration,
      startupScript,
      sourceImage,
      maxTimeMinutes,
      arch,
    }) {
      maxTime = Math.max(maxTime, maxTimeMinutes);
      if (onlyArch && onlyArch != arch) {
        console.log("Skipping ", arch);
        return;
      }
      if (image == null) {
        throw Error("bug -- image must not be null");
      }
      const name = await imageName({ image, date: new Date(), tag, arch });
      console.log("logging to ", logFile(name));
      await logToFile(name, { arch, configuration, sourceImage });
      let zone = "";
      zone = configuration.zone;
      vms.add(name);
      await createInstance({
        name,
        configuration,
        sourceImage,
        startupScript,
        metadata: { "serial-port-logging-enable": true },
      });
      await logToFile(name, "createImage: wait until startup script finishes");
      await waitForInstallToFinish({
        name,
        zone,
        maxTimeMinutes,
      });
      await logToFile(name, "createImage: create image from instance");
      await createImageFromInstance({ zone, name, maxTimeMinutes });
      if (!noDelete) {
        await logToFile(name, "createImage: delete the instance");
        await deleteInstance({ zone, name });
        vms.delete(name);
        await logToFile(name, "createImage: DONE!");
      }
      names.push(name);
    }
    const configs = getConf(image);
    if (noParallel) {
      // serial
      for (const config of configs) {
        await build(config);
      }
    } else {
      await Promise.all(configs.map(build));
    }
    console.log("CREATED", names);
    console.log("DONE", (Date.now() - t0) / 1000 / 60, "minutes");
    return names;
  } finally {
    if (vms.size > 0) {
      console.log(
        "\n-----------------------\n",
        "WARNING: the following VM's were NOT deleted due to errors or options -- ",
        Array.from(vms),
        `Note that each instance will still be automatically deleted after about ${
          2 * maxTime
        } minutes.`,
        "\n-----------------------\n",
      );
    }
  }
}

interface BuildConfig {
  image: ImageName;
  configuration: GoogleCloudConfiguration;
  startupScript: string;
  maxTimeMinutes: number;
  arch: Architecture;
  sourceImage: string;
}

function getConf(image: ImageName): BuildConfig[] {
  const { gpu } = IMAGES[image] ?? {};
  if (gpu) {
    return [createBuildConfiguration({ image, arch: "x86_64" })];
  } else {
    return [
      createBuildConfiguration({ image, arch: "x86_64" }),
      createBuildConfiguration({ image, arch: "arm64" }),
    ];
  }
}

function getSourceImage(arch: Architecture) {
  return `projects/ubuntu-os-cloud/global/images/ubuntu-2204-jammy-${
    arch == "arm64" ? "arm64-" : ""
  }v20230829`;
}

const LOGDIR = "logs";
function logFile(name) {
  return join(LOGDIR, `${name}.log`);
}
async function logToFile(name: string, ...args) {
  try {
    await mkdir(LOGDIR);
  } catch (_) {}
  for (const data of args) {
    if (typeof data == "string") {
      await appendFile(
        logFile(name),
        `${new Date().toISOString()}\n${data.trim()}\n`,
      );
    } else {
      await appendFile(
        logFile(name),
        `${new Date().toISOString()}\n${JSON.stringify(
          data,
          undefined,
          2,
        ).trim()}\n`,
      );
    }
  }
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
  let log = "";
  while (Date.now() - t0 <= maxTimeMinutes * 1000 * 60) {
    try {
      const prev = log;
      log = await getSerialPortOutput({ name, zone });
      if (!prev) {
        // don't write first few characters of output since it clears file
        // due to a control code...
        await logToFile(name, log.slice(100));
      } else {
        await logToFile(name, log.slice(prev.length));
      }
    } catch (err) {
      log = `WARNING -- ${err}`;
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

async function createImageFromInstance({ zone, name, maxTimeMinutes }) {
  logger.debug("createImageFromInstance", { zone, name });
  const instance = await getInstance({ zone, name });
  if (instance.state != "off") {
    logger.debug("createImageFromInstance: stopping instance...");
    await stopInstance({ zone, name, wait: true });
  }
  logger.debug("createImageFromInstance: creating image");
  await logToFile(name, "createImageFromInstance: creating image...");

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
  // this can take a long time!
  while (Date.now() - t0 <= 1000 * 60 * maxTimeMinutes) {
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

function createBuildConfiguration({
  image,
  arch = "x86_64",
}: {
  image: ImageName;
  arch: Architecture;
}): BuildConfig {
  const { label, docker, gpu } = IMAGES[image] ?? {};
  logger.debug("createBuildConfiguration", { image, label, docker, gpu });
  if (!docker) {
    throw Error(`unknown image '${image}'`);
  }
  const maxTimeMinutes = gpu ? 120 : 45;
  const configuration = {
    ...({
      cloud: "google-cloud",
      externalIp: true,
      spot: true,
      metadata: { "serial-port-logging-enable": true },
      // SSD is hugely better in terms of speeding things up, since we're basically
      // just extracting/copying files around.
      diskType: "pd-ssd",
      diskSizeGb: getMinDiskSizeGb({ image }),
      maxRunDurationSeconds: 60 * maxTimeMinutes,
    } as const),
    /* 
    We do NOT need a GPU to install the GPU libraries, but
    a lot of code gets built, so we do want a fast CPU.
    */
    ...(gpu
      ? ({
          zone: "northamerica-northeast2-a",
          region: "northamerica-northeast2",
          machineType: "n2-standard-8",
        } as const)
      : arch == "x86_64"
      ? ({
          region: "us-east1",
          zone: "us-east1-b",
          machineType: "c2-standard-4",
        } as const)
      : ({
          region: "us-central1",
          zone: "us-central1-a",
          machineType: "t2a-standard-4",
        } as const)),
  } as const;

  const startupScript = `
#!/bin/bash

${installDocker()}
${installUser()}

docker pull sagemathinc/compute-filesystem
docker pull ${docker}${arch == "x86_64" ? "" : "-arm64"}

${gpu ? installCuda() : ""}

df -h /
`;

  return {
    image,
    configuration,
    startupScript,
    maxTimeMinutes,
    arch,
    sourceImage: getSourceImage(arch),
  } as const;
}

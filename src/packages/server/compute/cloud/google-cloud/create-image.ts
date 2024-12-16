/*
~/cocalc/src/packages/server$ node
Welcome to Node.js v18.17.1.
Type ".help" for more information.
>

await require('./dist/compute/cloud/google-cloud/create-image').createImages({});

await require('./dist/compute/cloud/google-cloud/images').labelSourceImages({filter:{prod:false}})


images = require('./dist/compute/images'); a = require('./dist/compute/cloud/google-cloud/create-image');

(await images.getImages({noCache:true}))['jupyterhub']
await a.createImages({image:"jupyterhub"});

await a.createImages({image:"python", arch:'x86_64'})

await a.createImages({image:"pytorch"});

await a.createImages({image:"tensorflow"});

await a.createImages({image:"cuda"})

await a.createImages({image:"ollama"})

await a.createImages({image:"julia", tag:'1.9.4'});

await a.createImages({image:"sagemath", arch:'x86_64'});


await require('./dist/compute/cloud/google-cloud/create-image').createImages({gpu:true})

// (OCanger) This just creates ALL images in parallel:
await require('./dist/compute/cloud/google-cloud/create-image').createImages({})

a = require('./dist/compute/cloud/google-cloud/images')
{sourceImage} = await a.getNewestSourceImage({image:'python',test:true})

await a.setImageLabels({name:sourceImage, labels:{prod:true}})



// This labels *everything* that is not prod=true to instead
// have prod=true, because that's the default label if nothing
// is specified.

await require('./dist/compute/cloud/google-cloud/images').labelSourceImages({filter:{prod:false}})

*/

import {
  imageExists,
  deleteImage,
  getAllImages,
  imageName,
  getImagesClient,
  setImageLabels,
} from "./images";
import getLogger from "@cocalc/backend/logger";
import createInstance from "./create-instance";
import { getSerialPortOutput, deleteInstance, stopInstance } from "./client";
import {
  installCuda,
  installDocker,
  installUser,
  installCoCalc,
  installNode,
} from "../install";
import { delay } from "awaiting";
import getInstance from "./get-instance";
import type {
  Architecture,
  GoogleCloudConfiguration,
} from "@cocalc/util/db-schema/compute-servers";
import { makeValidGoogleName } from "@cocalc/util/db-schema/compute-servers";
import { getMinDiskSizeGb } from "@cocalc/util/db-schema/compute-servers";
import { appendFile, mkdir } from "fs/promises";
import { join } from "path";
import { getTag } from "@cocalc/server/compute/cloud/startup-script";
import { getImages, Images } from "@cocalc/server/compute/images";

const logger = getLogger("server:compute:google-cloud:create-image");

interface Options {
  image?: string;
  tag?: string;
  noDelete?: boolean;
  noParallel?: boolean;
  gpu?: boolean;
  arch?: Architecture;
  IMAGES?: Images;
  force?: boolean;
}

async function createAllImages(opts) {
  async function build(image) {
    return await createImages({ ...opts, image });
  }
  const t0 = Date.now();

  if (opts.IMAGES == null) {
    throw Error("IMAGES must be set");
  }
  const toBuild: string[] = [];
  for (const image in opts.IMAGES) {
    const x = opts.IMAGES[image];
    if (x.disabled || x.system) {
      continue;
    }
    toBuild.push(image);
  }

  let names: string[] = [];
  if (opts.noParallel) {
    // serial
    for (const image of toBuild) {
      names = names.concat(await build(image));
    }
  } else {
    for (const r of await Promise.all(toBuild.map(build))) {
      names = names.concat(r);
    }
  }
  console.log("CREATED", names);
  console.log("DONE", (Date.now() - t0) / 1000 / 60, "minutes");
  return names;
}

export async function createImages({
  image,
  tag,
  noDelete,
  noParallel,
  gpu,
  arch,
  IMAGES,
  force,
}: Options = {}): Promise<string[]> {
  // we use getImages({noCache:true}) to force updating the images before doing a build,
  // since this is when it matters (and this is rare).
  IMAGES = IMAGES ?? (await getImages({ noCache: true }));
  if (image == null) {
    // create all types
    return await createAllImages({
      image,
      noDelete,
      noParallel,
      gpu,
      arch,
      IMAGES,
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
    }: {
      image: string;
      configuration: GoogleCloudConfiguration;
      startupScript: string;
      sourceImage: string;
      maxTimeMinutes: number;
      arch: Architecture;
      gpu?: boolean;
    }) {
      maxTime = Math.max(maxTime, maxTimeMinutes);
      if (onlyArch && onlyArch != arch) {
        console.log("Skipping ", arch);
        return;
      }
      if (!image) {
        throw Error("bug -- image must be specified");
      }
      if (!configuration.tag) {
        throw Error("bug -- configuration.tag must be specified");
      }
      if (!arch) {
        throw Error("bug -- arch must be specified");
      }
      const name = await imageName({
        image,
        tag: configuration.tag,
        arch,
      });
      if (!force && (await imageExists(name))) {
        console.log(name, " -- image already exists, so not building it");
        return;
      }
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
      await setImageLabels({
        name,
        labels: {
          image: makeValidGoogleName(image),
          tag: makeValidGoogleName(configuration.tag),
          arch: makeValidGoogleName(arch),
          gpu: gpu ? "true" : null,
        },
      });
      // force updating the list of google cloud images (in database), since we just
      // changed them.  This of course only impacts the server we are running this on!
      await getAllImages({ noCache: true });
      if (!noDelete) {
        await logToFile(name, "createImage: delete the instance");
        await deleteInstance({ zone, name });
        vms.delete(name);
        await logToFile(name, "createImage: DONE!");
      }
      names.push(name);
    }
    const configs = getConf({ image, gpu, IMAGES, tag });
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
  image: string;
  configuration: GoogleCloudConfiguration;
  startupScript: string;
  maxTimeMinutes: number;
  arch: Architecture;
  sourceImage: string;
}

function getConf({
  image,
  gpu,
  IMAGES,
  tag,
}: {
  image: string;
  gpu?: boolean;
  IMAGES: Images;
  tag?: string;
}): BuildConfig[] {
  const data = IMAGES[image];
  console.log({ image, data });
  if (gpu != null && gpu != data.gpu) {
    // skip.
    return [];
  }
  if (data.gpu) {
    return [createBuildConfiguration({ image, arch: "x86_64", IMAGES, tag })];
  } else {
    return [
      createBuildConfiguration({ image, arch: "x86_64", IMAGES, tag }),
      createBuildConfiguration({ image, arch: "arm64", IMAGES, tag }),
    ];
  }
}

function getSourceImage(arch: Architecture, IMAGES: Images) {
  const version = IMAGES["google-cloud"]?.["base_image"]?.[arch];
  if (version) {
    return version;
  }

  // hard coded fallback:
  // ubuntu-2404-noble-arm64-v20241115
  // ubuntu-2404-noble-amd64-v20241115
  const GOOGLE_CLOUD_UBUNTU_VERSION = "20241115";

  return `projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-${
    arch == "arm64" ? "arm" : "amd"
  }64-v${GOOGLE_CLOUD_UBUNTU_VERSION}`;
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

  if (await imageExists(name)) {
    // this should be rare, but we support getting into this situation
    // via the force option.
    await logToFile(
      name,
      "createImageFromInstance: image exists, so deleting it before creating new version of it",
    );
    await deleteImage(name);
  }
  await logToFile(name, "createImageFromInstance: should now not exist");

  await logToFile(name, "createImageFromInstance: ", { imageResource });
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
    await logToFile(
      name,
      "createImageFromInstance: waiting ",
      n / 1000,
      "seconds for image to be created...",
    );
    await delay(n);
  }
  throw Error(`image creation did not finish -- ${name}`);
}

function createBuildConfiguration({
  image,
  arch,
  IMAGES,
  tag,
}: {
  image: string;
  arch: Architecture;
  IMAGES: Images;
  tag?: string;
}): BuildConfig {
  tag = getTag({ image, IMAGES, tag });
  const tag_filesystem = getTag({
    image: "filesystem",
    IMAGES,
  });
  const { label, package: pkg, gpu } = IMAGES[image] ?? {};
  logger.debug("createBuildConfiguration", {
    image,
    label,
    pkg,
    gpu,
    tag,
    tag_filesystem,
  });
  if (!pkg) {
    throw Error(`unknown image '${image}'`);
  }
  const maxTimeMinutes = gpu ? 120 : 90;
  const configuration = {
    image,
    tag,
    tag_filesystem,
    ...({
      cloud: "google-cloud",
      externalIp: true,
      spot: true,
      metadata: { "serial-port-logging-enable": true },
      // SSD is hugely better in terms of speeding things up, since we're basically
      // just extracting/copying files around.
      diskType: "pd-ssd",
      diskSizeGb: getMinDiskSizeGb({ configuration: { image }, IMAGES }),
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

  // IMPORTANT SECURITY NOTE: Do *NOT* install microk8s, even for an image
  // that uses it. Though it saves time (e.g., 30s), it likely also sets up
  // secret keys that would be a major security vulnerability, i.e., two kubernetes
  // VM's made from the same image have the same keys. So don't do that.

  const startupScript = `
#!/bin/bash
set -ev

apt-get update
apt-get upgrade -y

# Install docker daemon and client
${installDocker()}

# Create the user
${installUser()}

# Ensure a clean docker slate
docker system prune -a -f

# Install nodejs
${installNode()}

${installCoCalc({ IMAGES })}

# Pre-pull filesystem Docker container
docker pull ${IMAGES["filesystem"].package}:${tag_filesystem}

# Pre-pull compute Docker container
docker pull ${pkg}:${tag}

# On GPU nodes also install CUDA drivers (which takes a while)
${gpu ? installCuda() : ""}

df -h /
sync
`;

  return {
    image,
    configuration,
    startupScript,
    maxTimeMinutes,
    arch,
    sourceImage: getSourceImage(arch, IMAGES),
  } as const;
}

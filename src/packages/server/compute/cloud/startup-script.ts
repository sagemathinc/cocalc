import type { Architecture } from "./google-cloud/images";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { UID } from "./install";
import type { ImageName } from "@cocalc/util/db-schema/compute-servers";

export default async function startupScript({
  image = "minimal",
  compute_server_id,
  api_key,
  project_id,
  gpu,
  arch,
  hostname,
}: {
  image?: ImageName;
  compute_server_id: number;
  api_key?: string;
  project_id?: string;
  gpu?: boolean;
  arch: Architecture;
  hostname: string;
}) {
  if (!api_key) {
    throw Error("api_key must be specified");
  }
  if (!project_id) {
    throw Error("project_id must be specified");
  }

  let { dns: apiServer } = await getServerSettings();
  if (!apiServer.includes("://")) {
    apiServer = `https://${apiServer}`;
  }

  return `
#!/bin/bash

${runCoCalcCompute({
  compute_server_id,
  api_key,
  project_id,
  gpu,
  arch,
  hostname,
  apiServer,
  image,
})}
`;
}

// TODO: add tag for image to impose sanity...
// TODO: we could set the hostname in a more useful way!
function runCoCalcCompute(opts) {
  return `
# Mount the filesystem
${mountFilesystems(opts)}

# Start the manager
${computeManager(opts)}
`;
}

function mountFilesystems({ compute_server_id, api_key, project_id, arch, apiServer }) {
  const image = `sagemathinc/compute-filesystem${
    arch == "arm64" ? "-arm64" : ""
  }`;

  return `
# Make the home directory
rm -rf /home/user && mkdir /home/user && chown ${UID}:${UID} -R /home/user

# Mount the home directory using websocketfs by running a docker container.
# That is all the following container is supposed to do.  The mount line
# makes it so the mount is seen outside the container.
docker start filesystem || docker run \
   -d \
   --name=filesystem \
   -e API_KEY=${api_key} \
   -e PROJECT_ID=${project_id} \
   -e API_SERVER=${apiServer} \
   -e COMPUTE_SERVER_ID=${compute_server_id} \
   -e DEBUG=cocalc:* -e DEBUG_CONSOLE=yes  -e DEBUG_FILE=/tmp/log \
   --privileged \
   --mount type=bind,source=/home,target=/home,bind-propagation=rshared \
   -v /cocalc:/cocalc \
   ${image}
 `;
}

/* The additional flags beyond just '--gpus all' are because Nvidia's tensorflow
   image says this on startup:

NOTE: The SHMEM allocation limit is set to the default of 64MB.  This may be
insufficient for TensorFlow.  NVIDIA recommends the use of the following flags:
docker run --gpus all --ipc=host --ulimit memlock=-1 --ulimit stack=67108864 ...
docker run  ${gpu ? GPU_FLAGS : ""} \
*/

const GPU_FLAGS =
  " --gpus all --ipc=host --ulimit memlock=-1 --ulimit stack=67108864 ";

function computeManager({
  compute_server_id,
  api_key,
  project_id,
  arch,
  hostname,
  apiServer,
  image,
  gpu,
}) {
  const docker = `sagemathinc/compute-${image}${
    arch == "arm64" ? "-arm64" : ""
  }`;

  // Start a container that connects to the project
  // and manages providing terminals and jupyter kernels
  // in this environment.

  // The special mount line is necessary in case the filesystem has mounted when this
  // container starts (which is likely).

  return `
docker start compute || docker run -d ${gpu ? GPU_FLAGS : ""} \
   --name=compute \
   --hostname="${hostname}" \
   -e API_KEY=${api_key} \
   -e PROJECT_ID=${project_id} \
   -e COMPUTE_SERVER_ID=${compute_server_id} \
   -e API_SERVER=${apiServer} \
   -e DEBUG=cocalc:* -e DEBUG_CONSOLE=yes  -e DEBUG_FILE=/tmp/log \
   --privileged \
   --mount type=bind,source=/home,target=/home,bind-propagation=rshared \
   -p 443:443 \
   -p 80:80 \
   -v /var/run/docker.sock:/var/run/docker.sock \
   -v /cocalc:/cocalc \
   ${docker}
 `;
}

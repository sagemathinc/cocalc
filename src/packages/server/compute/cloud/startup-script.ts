import { getServerSettings } from "@cocalc/database/settings/server-settings";
import type {
  Architecture,
  ImageName,
} from "@cocalc/util/db-schema/compute-servers";
import { IMAGES } from "@cocalc/util/db-schema/compute-servers";
import { getImagePostfix } from "@cocalc/util/db-schema/compute-servers";
import {
  installCoCalc,
  installConf,
  installDocker,
  installUser,
  UID,
} from "./install";

export default async function startupScript({
  image = "minimal",
  compute_server_id,
  api_key,
  project_id,
  gpu,
  arch,
  hostname,
  installUser: doInstallUser,
}: {
  image?: ImageName;
  compute_server_id: number;
  api_key: string;
  project_id: string;
  gpu?: boolean;
  arch: Architecture;
  hostname: string;
  installUser?: boolean;
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

set -v

${defineSetStateFunction({ api_key, apiServer, compute_server_id })}

setState state running

docker
if [ $? -ne 0 ]; then
setState vm install-docker 120 20
${installDocker()}
fi
setState vm install '' 120 40

setState cocalc install-code '' 30 15
${installCoCalc(arch)}
if [ $? -ne 0 ]; then
   setState cocalc error "problem with installation"
   exit 1
fi
setState cocalc install-conf '' 30 40
${installConf({
  api_key,
  api_server: apiServer,
  project_id,
  compute_server_id,
  hostname,
})}
if [ $? -ne 0 ]; then
   setState cocalc error "problem installing configuration"
   exit 1
fi
${doInstallUser ? installUser() : ""}
if [ $? -ne 0 ]; then
   setState cocalc error "problem creating user"
   exit 1
fi
setState cocalc ready '' 0  100

setState vm start '' 60 60

${runCoCalcCompute({
  gpu,
  arch,
  image,
})}

while true; do
  setState vm ready '' 35 100
  sleep 30
done
`;
}

// TODO: add tag for image to impose sanity...
// TODO: we could set the hostname in a more useful way!
function runCoCalcCompute(opts) {
  return `
${filesystem(opts)}
${compute(opts)}
`;
}

function filesystem({ arch }) {
  const image = `sagemathinc/compute-filesystem${getImagePostfix(arch)}`;

  return `
# Docker container that mounts the filesystem(s)
setState filesystem init '' 30 15

# Make the home directory
# Note the filesystem mount is with the option nonempty, so
# we don't have to worry anymore about deleting /home/user/*,
# which is scary.
fusermount -u /home/user 2>/dev/null; mkdir -p /home/user && chown ${UID}:${UID} /home/user
if [ $? -ne 0 ]; then
   setState filesystem error "problem making /home/user directory"
   exit 1
fi

fusermount -u /home/unionfs/lower 2>/dev/null; mkdir -p /home/unionfs/lower && chown ${UID}:${UID} /home/unionfs/lower
if [ $? -ne 0 ]; then
   setState filesystem error "problem creating /home/unionfs/lower"
   exit 1
fi
mkdir -p /home/unionfs/upper && chown ${UID}:${UID} /home/unionfs/upper
if [ $? -ne 0 ]; then
   setState filesystem error "problem creating /home/unionfs/upper"
   exit 1
fi

# Mount the home directory using websocketfs by running a docker container.
# That is all the following container is supposed to do.  The mount line
# makes it so the mount is seen outside the container.

# NOTE: It's best for this docker run to NOT hardcode anything particular
# to auth or the target project, in case we want to make it easy to rotate
# keys and move data.

docker start filesystem >/dev/null 2>&1

if [ $? -ne 0 ]; then
  setState filesystem pull '' 20 20
  /cocalc/docker_pull.py ${image}
  if [ $? -ne 0 ]; then
     setState filesystem error "problem pulling Docker image ${image}"
     exit 1
  fi
  setState filesystem run '' 20 60
  docker run \
   -d \
   --name=filesystem \
   --privileged \
   --mount type=bind,source=/home,target=/home,bind-propagation=rshared \
   -v "$COCALC":/cocalc \
   ${image}
  if [ $? -ne 0 ]; then
     setState filesystem error "problem creating filesystem Docker container"
     exit 1
  fi
  setState filesystem running '' 20 80

else

  setState filesystem running '' 20 80
fi
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

function compute({ arch, image, gpu }) {
  const docker = IMAGES[image]?.docker ?? `sagemathinc/compute-${image}`;

  // Start a container that connects to the project
  // and manages providing terminals and jupyter kernels
  // in this environment.

  // The special mount line is necessary in case the filesystem has mounted when this
  // container starts (which is likely).

  return `
# Docker container that starts the compute manager, which is where the user
# runs code.  They are potentially likely to change data in this container.

# NOTE: It's best for this docker run to NOT hardcode anything particular
# to auth or the target project, in case we want to make it easy to rotate
# keys and move data.

docker start compute >/dev/null 2>&1

if [ $? -ne 0 ]; then
  setState compute pull '' 30 20
  /cocalc/docker_pull.py ${docker}${getImagePostfix(arch)}
  if [ $? -ne 0 ]; then
     setState compute error "problem pulling Docker image ${docker}${getImagePostfix(
       arch,
     )}"
     exit 1
  fi
  setState compute run '' 20 60
  docker run -d ${gpu ? GPU_FLAGS : ""} \
   --name=compute \
   --privileged \
   --mount type=bind,source=/home,target=/home,bind-propagation=rshared \
   -p 443:443 \
   -p 80:80 \
   -v /var/run/docker.sock:/var/run/docker.sock \
   -v "$COCALC":/cocalc \
   ${docker}${getImagePostfix(arch)}
  if [ $? -ne 0 ]; then
     setState compute error "problem creating compute Docker container"
     exit 1
  fi
  setState compute running '' 30 80

else

  setState compute running '' 30 80
fi
 `;
}

export function defineSetStateFunction({ api_key, apiServer, compute_server_id }) {
  return `
function setState {
  id=${compute_server_id}
  name=$1
  state=$2
  extra=$3
  timeout=$4
  progress=$5

  echo "name is $state"
  curl -sk -u ${api_key}:  -H 'Content-Type: application/json' -d "{\\"id\\":$id,\\"name\\":\\"$name\\",\\"state\\":\\"$state\\",\\"extra\\":\\"$extra\\",\\"timeout\\":$timeout,\\"progress\\":$progress}" ${apiServer}/api/v2/compute/set-component-state
}
  `;
}



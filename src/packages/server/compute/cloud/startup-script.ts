import { getServerSettings } from "@cocalc/database/settings/server-settings";
import type {
  Architecture,
  ImageName,
} from "@cocalc/util/db-schema/compute-servers";
import { IMAGES } from "@cocalc/util/db-schema/compute-servers";
import { getImagePostfix } from "@cocalc/util/db-schema/compute-servers";
import { installCoCalc, installConf, installUser, UID } from "./install";

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

setState vm init

setState cocalc install
${installCoCalc(arch)}
if [ $? -ne 0 ]; then
   setState cocalc error "problem with installation"
   exit 1
fi
setState cocalc ready

setState conf install
${installConf({
  api_key,
  api_server: apiServer,
  project_id,
  compute_server_id,
  hostname,
})}
if [ $? -ne 0 ]; then
   setState conf error "problem installing configuration"
   exit 1
fi
${doInstallUser ? installUser() : ""}
if [ $? -ne 0 ]; then
   setState conf error "problem creating user"
   exit 1
fi
setState conf ready

${runCoCalcCompute({
  gpu,
  arch,
  image,
})}

setState vm ready
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
setState filesystem init

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
  setState filesystem pull
  /cocalc/docker_pull.py ${image}
  if [ $? -ne 0 ]; then
     setState filesystem error "problem pulling Docker image ${image}"
     exit 1
  fi
  setState filesystem run
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
  setState filesystem running

else

  setState filesystem running
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
  setState compute pull
  /cocalc/docker_pull.py ${docker}${getImagePostfix(arch)}
  if [ $? -ne 0 ]; then
     setState compute error "problem pulling Docker image ${docker}${getImagePostfix(
       arch,
     )}"
     exit 1
  fi
  setState compute run
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
  setState compute running

else

  setState compute running
fi
 `;
}

function defineSetStateFunction({ api_key, apiServer, compute_server_id }) {
  return `
function setState {
  idnum=${compute_server_id}
  compname=$1
  compvalue=$2
  compextra=$3

  curl -sk -u ${api_key}:  -H 'Content-Type: application/json' -d "{\\"id\\":$idnum,\\"name\\":\\"$compname\\",\\"value\\":\\"$compvalue\\",\\"extra\\":\\"$compextra\\"}" ${apiServer}/api/v2/compute/set-component-state
}
  `;
}

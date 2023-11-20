import { getServerSettings } from "@cocalc/database/settings/server-settings";
import type {
  Architecture,
  ImageName,
} from "@cocalc/util/db-schema/compute-servers";
import { IMAGES } from "@cocalc/util/db-schema/compute-servers";
import { getImagePostfix } from "@cocalc/util/db-schema/compute-servers";
import {
  installDocker,
  installNode,
  installCoCalc,
  installConf,
  installUser,
  UID,
} from "./install";

// A one line startup script that grabs the latest version of the
// real startup script via the API.  This is important, e.g., if
// the user reboots the VM in some way, so they get the latest
// startup script (with newest ssh keys, etc.) on startup.
export async function startupScriptViaApi({ compute_server_id, api_key }) {
  const apiServer = await getApiServer();
  return `curl -fsS ${apiServer}/compute/${compute_server_id}/onprem/start/${api_key} | sudo bash`;
}

async function getApiServer() {
  let { dns: apiServer } = await getServerSettings();
  if (!apiServer.includes("://")) {
    apiServer = `https://${apiServer}`;
  }
  return apiServer;
}

export default async function startupScript({
  image = "python",
  compute_server_id,
  api_key,
  project_id,
  gpu,
  arch,
  hostname,
  exclude_from_sync,
  installUser: doInstallUser,
}: {
  image?: ImageName;
  compute_server_id: number;
  api_key: string;
  project_id: string;
  gpu?: boolean;
  arch: Architecture;
  hostname: string;
  exclude_from_sync: string;
  installUser?: boolean;
}) {
  if (!api_key) {
    throw Error("api_key must be specified");
  }
  if (!project_id) {
    throw Error("project_id must be specified");
  }

  const apiServer = await getApiServer();

  return `
#!/bin/bash

set -v

export DEBIAN_FRONTEND=noninteractive

${defineSetStateFunction({ api_key, apiServer, compute_server_id })}

setState state running

setState install configure '' 60 10
${await installConf({
  api_key,
  api_server: apiServer,
  project_id,
  compute_server_id,
  hostname,
  exclude_from_sync,
})}
if [ $? -ne 0 ]; then
   setState install error "problem installing configuration"
   exit 1
fi

${rootSsh()}

${allowAnyPort()}

docker
if [ $? -ne 0 ]; then
setState install install-docker '' 120 20
${installDocker()}
fi

setState install install-nodejs 60 50
${installNode()}
if [ $? -ne 0 ]; then
   setState install error "problem installing nodejs"
   exit 1
fi

setState install install-cocalc '' 60 70
${installCoCalc(arch)}
if [ $? -ne 0 ]; then
   setState install error "problem installing cocalc"
   exit 1
fi

setState install install-user '' 60 80
${doInstallUser ? installUser() : ""}
if [ $? -ne 0 ]; then
   setState install error "problem creating user"
   exit 1
fi
setState install ready '' 0  100

setState vm start '' 60 60

${runCoCalcCompute({
  gpu,
  arch,
  image,
})}

exec /cocalc/disk_enlarger.py 2> /var/log/disk-enlarger.log >/var/log/disk-enlarger.log &

while true; do
  setState vm ready '' 35 100
  sleep 30
done
`;
}

function rootSsh() {
  return `
# Install ssh keys for root access to VM
mkdir -p /root/.ssh
cat /cocalc/conf/authorized_keys > /root/.ssh/authorized_keys
`;
}

/*
Allowing user to bind to any port (esp 443) makes sense for our security model where
user can be root without a password via sudo.

See https://superuser.com/questions/710253/allow-non-root-process-to-bind-to-port-80-and-443
*/
function allowAnyPort() {
  return `
# Allow user to bind to any port:
echo 'net.ipv4.ip_unprivileged_port_start=0' > /etc/sysctl.d/50-unprivileged-ports.conf
sysctl --system
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
setState filesystem init '' 60 15

# Make the home directory
# Note the filesystem mount is with the option nonempty, so
# we don't have to worry anymore about deleting /home/user/*,
# which is scary.
fusermount -u /home/user 2>/dev/null; mkdir -p /home/user && chown ${UID}:${UID} /home/user
if [ $? -ne 0 ]; then
   setState filesystem error "problem making /home/user directory"
   exit 1
fi

# Mount the home directory using websocketfs by running a docker container.
# That is all the following container is supposed to do.  The mount line
# makes it so the mount is seen outside the container.

# NOTE: It's best for this docker run to NOT hardcode anything particular
# to auth or the target project, in case we want to make it easy to rotate
# keys and move data.

mkdir -p /data
chown user:user /data

docker start filesystem >/dev/null 2>&1

if [ $? -ne 0 ]; then
  setState filesystem run '' 45 25

  docker run \
   -d \
   --name=filesystem \
   --privileged \
   --mount type=bind,source=/data,target=/data,bind-propagation=rshared \
   --mount type=bind,source=/tmp,target=/tmp,bind-propagation=rshared \
   --mount type=bind,source=/home,target=/home,bind-propagation=rshared \
   -v /cocalc:/cocalc \
   ${image}
  if [ $? -ne 0 ]; then
     setState filesystem error "problem creating filesystem Docker container"
     exit 1
  fi
  setState filesystem running '' 45 80

else

  setState filesystem running '' 45 80
fi
 `;
}

/*
Removed -- any code that needs updating should be in /cocalc!

  setState filesystem pull '' 240 20
  /cocalc/docker_pull.py ${image}
  if [ $? -ne 0 ]; then
     setState filesystem error "problem pulling Docker image ${image}"
     exit 1
  fi

*/

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
  setState compute run '' 20 25
  docker run -d ${gpu ? GPU_FLAGS : ""} \
   --name=compute \
   --network host \
   --privileged \
   --mount type=bind,source=/data,target=/data,bind-propagation=rshared \
   --mount type=bind,source=/tmp,target=/tmp,bind-propagation=rshared \
   --mount type=bind,source=/home,target=/home,bind-propagation=rshared \
   -v /var/run/docker.sock:/var/run/docker.sock \
   -v /cocalc:/cocalc \
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

/*
I had this code for auto-pulling new image right after the if, but it's a really
bad idea in production (especially with dockerhub bandwidth limits and these images
can be big too).  Needs to be totally explicit or not at all:

  setState compute pull '' 600 20
  /cocalc/docker_pull.py ${docker}${getImagePostfix(arch)}
  if [ $? -ne 0 ]; then
     setState compute error "problem pulling Docker image ${docker}${getImagePostfix(
       arch,
     )}"
     exit 1
  fi
*/

export function defineSetStateFunction({
  api_key,
  apiServer,
  compute_server_id,
}) {
  return `
function setState {
  id=${compute_server_id}
  name=$1
  state=\${2:-'ready'}
  extra=\${3:-''}
  timeout=\${4:-0}
  progress=\${5:-100}

  echo "$name is $state"
  curl -sk -u ${api_key}:  -H 'Content-Type: application/json' -d "{\\"id\\":$id,\\"name\\":\\"$name\\",\\"state\\":\\"$state\\",\\"extra\\":\\"$extra\\",\\"timeout\\":$timeout,\\"progress\\":$progress}" ${apiServer}/api/v2/compute/set-detailed-state
}
  `;
}

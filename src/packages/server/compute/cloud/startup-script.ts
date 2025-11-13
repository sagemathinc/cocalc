import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { getImages, Images } from "@cocalc/server/compute/images";
import {
  installTime,
  installNode,
  installCoCalc,
  installZpool,
  installDocker,
  installDockerGroup,
  installNvidiaDocker,
  installConf,
  installMicroK8s,
  installUser,
  UID,
} from "./install";
import type { Cloud } from "@cocalc/util/db-schema/compute-servers";
import {
  CHECK_IN_PATH,
  CHECK_IN_PERIOD_S,
} from "@cocalc/util/db-schema/compute-servers";
import basePath from "@cocalc/backend/base-path";

// A one line startup script that grabs the latest version of the
// real startup script via the API.  This is important, e.g., if
// the user reboots the VM in some way, so they get the latest
// cocalc startup script (with newest ssh keys, etc.) on startup.
// This is assumed to be 1 line in various place, e.g., in cloudInitScript below.
export async function startupScriptViaApi({ compute_server_id, api_key }) {
  const apiServer = await getApiServer();
  return `curl -fsS ${apiServer}/compute/${compute_server_id}/onprem/start/${api_key} | sudo bash 2>&1 | tee /var/log/cocalc-startup.log`;
}

export async function cloudInitScript({
  compute_server_id,
  api_key,
  local_ssd,
}) {
  // This is a little tricky because we want it to run *every* time,
  // not just the first time, and cloud init doesn't have a nice way to
  // do that. That's why there is /root/cocalc-startup.sh

  let ephemeral = "";
  if (!local_ssd) {
    // When no local_ssd, we reset /usr/local/sbin/prepare_ephemeral_disk.sh, since
    // otherwise the user's data volume gets deleted by an non-ZFS aware
    // script from hyperstack, which is very bad for us.
    ephemeral = `
  - path: /usr/local/sbin/prepare_ephemeral_disk.sh
    permissions: "0700"
    content: |
        #!/bin/bash
        echo "explicitly disabling ephemeral disk configuration to block what hyperstack does -- otherwise this would delete the user volume!"
`;
  }

  return `#cloud-config

write_files:
${ephemeral}
  - path: /root/cocalc-startup.sh
    permissions: "0700"
    content: |
        #!/bin/bash
        ${await startupScriptViaApi({ compute_server_id, api_key })}
        if [ $? -eq 0 ]; then
            exit 0
        fi
        # If the script fails (e.g., due to timing weirdness), we
        # try restarting docker and running it again.
        sleep 1
        service docker restart
        ${await startupScriptViaApi({ compute_server_id, api_key })}
        if [ $? -eq 0 ]; then
            exit 0
        fi
        sleep 3
        service docker restart
        ${await startupScriptViaApi({ compute_server_id, api_key })}
        if [ $? -eq 0 ]; then
            exit 0
        fi

runcmd:
  - |
    #!/bin/bash
    set -v
    crontab -l | grep "@reboot /root/cocalc-startup.sh"
    if [ $? -ne 0 ]; then
        # first boot ever, and crontab not setup, so we we add /root/cocalc-start.sh to
        # crontab and run it. Otherwise, it will already be run.
        (crontab -l 2>/dev/null; echo "@reboot /root/cocalc-startup.sh") | crontab -
        /root/cocalc-startup.sh
    fi
`;
}

async function getApiServer() {
  let { dns: apiServer } = await getServerSettings();
  if (!apiServer.includes("://")) {
    apiServer = `https://${apiServer}`;
  }
  if (basePath.length > 1) {
    apiServer += basePath;
  }
  return apiServer;
}

export default async function startupScript({
  cloud,
  image = "python",
  tag,
  tag_filesystem,
  tag_cocalc,
  compute_server_id,
  api_key,
  project_id,
  gpu,
  hostname,
  exclude_from_sync,
  auth_token,
  proxy,
  installUser: doInstallUser,
  local_ssd,
}: {
  cloud: Cloud;
  image?: string; // compute image
  tag?: string; // compute docker image tag
  tag_filesystem?: string; // filesystem docker image tag
  tag_cocalc?: string; // @cocalc/compute-server npm package tag
  compute_server_id: number;
  api_key: string;
  project_id: string;
  gpu?: boolean;
  hostname: string;
  exclude_from_sync: string;
  auth_token: string;
  proxy;
  installUser?: boolean;
  local_ssd?: boolean;
}) {
  if (!api_key) {
    throw Error("api_key must be specified");
  }
  if (!project_id) {
    throw Error("project_id must be specified");
  }
  // handle deprecated image names.
  image = imageDeprecation(image);

  const apiServer = await getApiServer();
  const IMAGES = await getImages();

  return `
#!/bin/bash

set -v

export COCALC_CLOUD=${cloud}
export DEBIAN_FRONTEND=noninteractive
export COCALC_LOCAL_SSD=${local_ssd ?? ""}
export CONAT_SERVER=${apiServer}

${defineSetStateFunction({ api_key, apiServer, compute_server_id })}

setState state running

# make sure nothing involving apt-get is running (e.g., auto updates)
# Basically, unattended upgrades can randomly run and just totally break
# the startup script, which is really painful.
pkill -9 apt-get || true
pkill -f -9 unattended-upgrade || true
apt-get remove -y unattended-upgrades || true

${installTime()}

setState install configure '' 60 10
${await installConf({
  api_key,
  api_server: apiServer,
  project_id,
  compute_server_id,
  hostname,
  exclude_from_sync,
  auth_token,
  proxy,
})}
if [ $? -ne 0 ]; then
   setState install error "problem installing configuration"
   exit 1
fi

${rootSsh()}

${userSsh()}

docker
if [ $? -ne 0 ]; then
   setState install install-docker '' 120 20
   ${installDocker()}
   ${installNvidiaDocker({ gpu })}
   if [ $? -ne 0 ]; then
      setState install error "problem installing Docker"
      exit 1
   fi
fi

${installDockerGroup()}

setState install install-nodejs '' 60 40
${installNode()}
if [ $? -ne 0 ]; then
   setState install error "problem installing nodejs"
   exit 1
fi

setState install install-cocalc '' 60 50
${installCoCalc({ IMAGES, tag: tag_cocalc })}
if [ $? -ne 0 ]; then
   setState install error "problem installing cocalc"
   exit 1
fi

setState install install-zpool '' 120 60
${installZpool({ cloud })}
if [ $? -ne 0 ]; then
   setState install error "problem configuring zpool"
   exit 1
fi

setState install install-user '' 60 70
${doInstallUser ? installUser() : ""}
if [ $? -ne 0 ]; then
   setState install error "problem creating user"
   exit 1
fi

# install-k8s has to be AFTER install-user.
${installMicroK8s({ image, IMAGES, gpu })}
if [ $? -ne 0 ]; then
   setState install error "problem installing kubernetes"
   exit 1
fi

setState install install-k8s '' 120 90

setState install ready '' 0  100

setState vm start '' 60 60

${runCoCalcCompute({
  gpu,
  image,
  tag,
  tag_filesystem,
  IMAGES,
})}

echo "Launching background daemons: disk_enlarger.py and check_in.py"

exec /usr/bin/python3 -u /cocalc/disk_enlarger.py 2> /var/log/cocalc-disk-enlarger.err >/var/log/cocalc-disk-enlarger.log &

exec /usr/bin/python3 -u /cocalc/check_in.py ${CHECK_IN_PERIOD_S} ${CHECK_IN_PATH} 2> /var/log/cocalc-check-in.err >/var/log/cocalc-check-in.log &

# Put back unattended upgrades, since they are good to have for security reasons.
apt-get install -y unattended-upgrades || true

echo "Startup complete!"
`;
}

function rootSsh() {
  return `
# Install ssh keys for root access to VM
mkdir -p /root/.ssh
cat /cocalc/conf/authorized_keys > /root/.ssh/authorized_keys
`;
}

// Make it so doing 'ssh user@host' ends up in the *compute* docker container, rather than
// on the host machine.  This fully works for tcp port forwarding, rsync, etc, in addition to
// normal logins, beause of the complicated conditional force command below.
// This is important, since otherwise 'ssh user@host' would put the user in an
// environment without the software install they are expecting.
// This approach is more robust to configure than running ssh directly on the compute docker
// container on a different port, but slightly more limited, e.g., X11 port forwarding doesn't
// seem to work, but is also something that we wouldn't want to do this way anyways.
// NOTE the Quoted heredoc to get the escaping right; there was a bug for a while.
function userSsh() {
  return `
# Make it so doing 'ssh user@host' ends up in the *compute* docker container.
# Also rsync and 'ssh user@host command' should work too.
# To get into the true root of the VM, the user has to do 'ssh root@host'.

cat > /etc/ssh/sshd_config <<'EOF'
Include /etc/ssh/sshd_config.d/*.conf
PasswordAuthentication no
KbdInteractiveAuthentication no
UsePAM yes
X11Forwarding yes
PrintMotd no
AcceptEnv LANG LC_*
Subsystem sftp /usr/lib/openssh/sftp-server

Match User user
   ForceCommand [[ -z "\${SSH_ORIGINAL_COMMAND}" ]] && docker exec -w /home/user -it compute bash || docker exec -w /home/user -i compute \${SSH_ORIGINAL_COMMAND}
EOF

systemctl daemon-reload
service ssh restart
`;
}

// This causes trouble -- breaks everything.  So maybe it's just part of instructions
// or something else.  Think harder.
// /*
// Allowing user to bind to any port (esp 443) makes sense for our security model where
// user can be root without a password via sudo.

// See https://superuser.com/questions/710253/allow-non-root-process-to-bind-to-port-80-and-443
// */
// function allowAnyPort() {
//   return `
// # Allow user to bind to any port:
// echo 'net.ipv4.ip_unprivileged_port_start=0' > /etc/sysctl.d/50-unprivileged-ports.conf
// sysctl --system
// `;
// }

// TODO: add tag for image to impose sanity...
// TODO: we could set the hostname in a more useful way!
function runCoCalcCompute(opts) {
  return `
${startDocker()}
${filesystem(opts)}
${compute(opts)}
`;
}

function startDocker() {
  return `

# sometimes after configuring the zpool, docker is not running, or
# it never started due to the zpool needing to be configured, so we
# ensure docker is running.

while true; do
    docker ps
    if [ $? -eq 0 ]; then
        break
    else
        echo "Docker not running; trying to start it again..."
        sleep 1
        service docker start
    fi
done
`;
}

function filesystem({
  IMAGES,
  tag_filesystem,
}: {
  IMAGES: Images;
  tag_filesystem?: string;
}) {
  const tag = getTag({
    image: "filesystem",
    IMAGES,
    tag: tag_filesystem,
  });
  const docker = IMAGES["filesystem"].package;

  return `
# Docker container that mounts the file system(s)
setState filesystem init '' 60 15

# Make the home directory
# Note the file system mount is with the option nonempty, so
# we don't have to worry anymore about deleting /home/user/*,
# which is scary.
fusermount -u /home/user || true
umount -l /home/user || true
mkdir -p /home/user && chown ${UID}:${UID} /home/user
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
chown 2001:2001 /data

docker stop filesystem >/dev/null 2>&1
docker rm filesystem >/dev/null 2>&1

setState filesystem run '' 45 25

# Get the total RAM
total_ram=$(free -g | grep Mem: | awk '{print $2}')

# Compute TOTAL_RAM as MAX(1, total_ram - 1)
export TOTAL_RAM=$(($total_ram - 1))
if [ "$TOTAL_RAM" -lt 1 ]; then
    # Obviously 0 wouldn't work below.
    export TOTAL_RAM=1
fi

mkdir -p /ephemeral
chown 2001:2001 /ephemeral
docker run \
 -d \
 --name=filesystem \
 --security-opt no-new-privileges=false \
 --privileged \
 --memory "$TOTAL_RAM"g --memory-swap "$TOTAL_RAM"g \
 --mount type=bind,source=/data,target=/data,bind-propagation=rshared \
 --mount type=bind,source=/tmp,target=/tmp,bind-propagation=rshared \
 --mount type=bind,source=/home,target=/home,bind-propagation=rshared \
 --mount type=bind,source=/ephemeral,target=/ephemeral,bind-propagation=rshared \
 -v /cocalc:/cocalc \
 ${docker}:${tag}

if [ $? -ne 0 ]; then
   setState filesystem error "problem creating filesystem Docker container"
   exit 1
fi

setState filesystem running '' 45 80
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

function compute({
  image,
  tag,
  gpu,
  IMAGES,
}: {
  image: string;
  tag?: string;
  gpu?: boolean;
  IMAGES: Images;
}) {
  const docker = IMAGES[image]?.package ?? `sagemathinc/${image}`;
  tag = getTag({ image, IMAGES, tag });

  // Start a container that connects to the project
  // and manages providing terminals and jupyter kernels
  // in this environment.

  // The special mount line is necessary in case the file system has mounted when this
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
  total_ram=$(free -g | grep Mem: | awk '{print $2}')
  export TOTAL_RAM=$(($total_ram - 1))
  if [ "$TOTAL_RAM" -lt 1 ]; then
      # Obviously 0 wouldn't work below.
      export TOTAL_RAM=1
  fi
  mkdir -p /ephemeral
  chown 2001:2001 /ephemeral
  docker run -d ${gpu ? GPU_FLAGS : ""} \
   --name=compute \
   --network host \
   --security-opt no-new-privileges=false \
   --privileged \
   --memory "$TOTAL_RAM"g --memory-swap "$TOTAL_RAM"g \
   --mount type=bind,source=/data,target=/data,bind-propagation=rshared \
   --mount type=bind,source=/tmp,target=/tmp,bind-propagation=rshared \
   --mount type=bind,source=/home,target=/home,bind-propagation=rshared \
   --mount type=bind,source=/ephemeral,target=/ephemeral,bind-propagation=rshared \
   -v /var/run/docker.sock:/var/run/docker.sock \
   -v /cocalc:/cocalc \
   ${docker}:${tag}
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

/*
If tag is given and available just returns that tag.
If tag is given but not available or no tag is given,
returns the newest tested tag, unless no tags are tested,
in which case we just return the newest tag.
Returns 'latest' in case nothing is available.
*/

export function getTag({
  image,
  IMAGES,
  tag,
}: {
  image: string;
  IMAGES: Images;
  tag?: string;
}): string {
  image = imageDeprecation(image);
  let { versions } = IMAGES[image] ?? {};
  if (versions == null || versions.length == 0) {
    return "latest";
  }
  if (tag) {
    for (const x of versions) {
      if (x?.tag == tag) {
        // tag is available
        return tag;
      }
    }
  }
  // tag is not available or not tag given, so
  // try to return newest (latested in array, not
  // actually sorting by tag) tested version.
  const tested = versions.filter((x) => x.tested);
  if (tested.length > 0) {
    return tested[tested.length - 1]?.tag ?? "latest";
  }
  // just return non-tested newest sine nothing is tested.
  const version = versions[versions.length - 1];
  return version.tag ?? "latest";
}

export function imageDeprecation(image) {
  if (image == "cuda12") {
    return "cuda";
  } else if (image == "sagemath-10.1") {
    return "sagemath";
  } else if (image == "rlang") {
    return "rstats";
  } else if (image == "colab-gpu") {
    return "colab";
  }
  return image;
}

/*
This all assume Ubuntu 22.04.
*/

import { CudaVersion } from "@cocalc/util/db-schema/compute-servers";
import getSshKeys from "@cocalc/server/projects/get-ssh-keys";
import {
  Architecture,
  getImagePostfix,
} from "@cocalc/util/db-schema/compute-servers";

// for consistency with cocalc.com
export const UID = 2001;

// Install lightweight version of nodejs that we can depend on.
// Note that the exact version is VERY important, e.g., the most
// recent 18.x and 20.x versions totally broke node-pty in horrible
// ways... so we really can't depend on something random for node,
// hence the version is hard coded here.  See https://github.com/sagemathinc/cocalc/issues/6963
const NODE_VERSION = "18.17.1";

// see https://github.com/nvm-sh/nvm#install--update-script for this version:
const NVM_VERSION = "0.39.5";
export function installNode() {
  return `
mkdir -p /cocalc/nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v${NVM_VERSION}/install.sh | NVM_DIR=/cocalc/nvm PROFILE=/dev/null bash
source /cocalc/nvm/nvm.sh
nvm install --no-progress ${NODE_VERSION}
rm -rf /cocalc/nvm/.cache
`;
}

export function installDocker() {
  // See https://docs.docker.com/engine/install/ubuntu/
  return `
# Uninstall old versions, if any
apt-get remove -y  docker.io docker-doc docker-compose podman-docker containerd runc || true

# Add Docker's official GPG key:
apt-get update -y
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add the repository to Apt sources:
echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y

apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

service docker start

`;
}

export function installUser() {
  return `
# Create the "user" if they do not already exist:

if ! id -u user >/dev/null 2>&1; then

  /usr/sbin/groupadd --gid=${UID} -o user
  /usr/sbin/useradd  --home-dir=/home/user --gid=${UID} --uid=${UID} --shell=/bin/bash user
  rm -rf /home/user && mkdir /home/user &&  chown ${UID}:${UID} -R /home/user

  # Allow to be root
  echo '%user ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers

  # Allow to use FUSE
  sed -i 's/#user_allow_other/user_allow_other/g' /etc/fuse.conf

  # Add user to the docker group, so that they can
  # use docker without having to do "sudo".

  sed -i 's/docker:x:999:/docker:x:999:user/' /etc/group

fi
`;
}

export function installCoCalc(arch: Architecture) {
  return `
NVM_DIR=/cocalc/nvm source /cocalc/nvm/nvm.sh
npx -y @cocalc/compute-server${getImagePostfix(arch)} /cocalc
`;
}

export async function installConf({
  api_key,
  api_server,
  project_id,
  compute_server_id,
  hostname,
  exclude_from_sync,
}) {
  const auth = await authorizedKeys(project_id);
  return `
# Setup Current CoCalc Connection Configuration --
mkdir -p /cocalc/conf
echo "${api_key}" > /cocalc/conf/api_key
echo "${api_server}" > /cocalc/conf/api_server
echo "${project_id}" > /cocalc/conf/project_id
echo "${compute_server_id}" > /cocalc/conf/compute_server_id
echo "${hostname}" > /cocalc/conf/hostname
echo '${auth}' > /cocalc/conf/authorized_keys
echo '${exclude_from_sync}' > /cocalc/conf/exclude_from_sync
`;
}

/*
THIS works to install CUDA

https://developer.nvidia.com/cuda-downloads?target_os=Linux&target_arch=x86_64&Distribution=Ubuntu&target_version=22.04&target_type=deb_network

(NOTE: K80's don't work since they are too old and not supported!)

It takes about 10 minutes and 15GB of disk space are used on / afterwards.  The other approaches don't
seem to work.

NOTE: We also install nvidia-container-toolkit, which isn't in the instructions linked to above,
because we want to support using Nvidia inside of Docker.

Links to all versions: https://developer.nvidia.com/cuda-toolkit-archive

Can see the versions from Ubuntu via: apt-cache madison cuda

Code below with awk works pretty generically regarding supporting many cuda versions.

*/

export function installCuda(cudaVersion: CudaVersion) {
  return `
curl -o cuda-keyring.deb https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
dpkg -i cuda-keyring.deb
rm cuda-keyring.deb
apt-get update -y
export CUDA_VERSION=$(apt-cache madison cuda | awk '/${cudaVersion}/ { print $3 }' | head -1)
apt-get -y install cuda=$CUDA_VERSION nvidia-container-toolkit
apt-get --purge -y remove  nvidia-kernel-source-545
apt-get -y autoremove
apt-get -y install nvidia-kernel-open-545 cuda-drivers-545
`;
}

async function authorizedKeys(project_id: string) {
  const sshKeys = await getSshKeys(project_id);
  return (
    "# This file is managed by CoCalc.  Add keys in account prefs and project settings.\n# See https://doc.cocalc.com/account/ssh.html\n\n" +
    Object.values(sshKeys)
      .map(({ value }) => `# Added by CoCalc\n${value}`.trim())
      .join("\n") +
    "\n"
  );
}

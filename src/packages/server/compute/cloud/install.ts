/*
This all assume Ubuntu 22.04.
*/

import {
  CudaVersion,
  DOCKER_USER,
  getImagePostfix,
} from "@cocalc/util/db-schema/compute-servers";

// for consistency with cocalc.com
export const UID = 2001;

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

export function installCoCalc(arch) {
  const image = `${DOCKER_USER}/compute-cocalc${getImagePostfix(arch)}`;
 return `
if [ -z "$COCALC" ]; then
  export COCALC=/cocalc
fi

docker pull ${image}
new_id=$(docker images --digests --no-trunc --quiet ${image}:latest)

if [ ! -f "$COCALC"/.versions/"$new_id" ]; then
  rm -rf /tmp/cocalc
  docker create --name temp-copy-cocalc ${image}
  docker cp temp-copy-cocalc:/cocalc /tmp/cocalc
  mkdir -p "$COCALC"/conf
  mv "$COCALC"/conf /tmp/cocalc/conf
  rsync -axH --delete /tmp/cocalc/ "$COCALC"/
  rm -rf /tmp/cocalc
  docker rm temp-copy-cocalc
  mkdir -p "$COCALC"/.versions
  touch "$COCALC"/.versions/"$new_id"
fi
`;
}

export function installConf({
  api_key,
  api_server,
  project_id,
  compute_server_id,
  hostname,
}) {
  return `
# Setup Current CoCalc Connection Configuration --

mkdir -p "$COCALC"/conf
echo "${api_key}" > "$COCALC"/conf/api_key
echo "${api_server}" > "$COCALC"/conf/api_server
echo "${project_id}" > "$COCALC"/conf/project_id
echo "${compute_server_id}" > "$COCALC"/conf/compute_server_id
echo "${hostname}" > "$COCALC"/conf/hostname
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
apt-get update -y
export CUDA_VERSION=$(apt-cache madison cuda | awk '/${cudaVersion}/ { print $3 }' | head -1)
apt-get -y install cuda=$CUDA_VERSION nvidia-container-toolkit
rm cuda-keyring.deb
`;
}

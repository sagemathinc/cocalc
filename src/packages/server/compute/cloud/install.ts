/*
This all assume Ubuntu 22.04.
*/

import getSshKeys from "@cocalc/server/projects/get-ssh-keys";
import { getImageField } from "@cocalc/util/db-schema/compute-servers";
import { getTag } from "@cocalc/server/compute/cloud/startup-script";
import type { Images } from "@cocalc/server/compute/images";
import {
  PROXY_CONFIG,
  PROXY_AUTH_TOKEN_FILE,
} from "@cocalc/util/compute/constants";
import type { Cloud } from "@cocalc/util/db-schema/compute-servers";

// for consistency with cocalc.com
export const UID = 2001;

// Very bad things happen with many things if the clock is NOT set
// correctly, or within at least a few seconds.  On VM's it is quite
// common for clocks to get screwed up.   Thus we ensure
// automatic timesync is configured.
export function installTime() {
  return `
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y systemd-timesyncd

# Make time sync a little more aggressive:

echo 'RootDistanceMaxSec=1' >> /etc/systemd/timesyncd.conf
echo 'PollIntervalMinSec=16' >> /etc/systemd/timesyncd.conf
echo 'PollIntervalMaxSec=45' >> /etc/systemd/timesyncd.conf
systemctl restart systemd-timesyncd
`;
}

// Install lightweight version of nodejs that we can depend on.
// This has to be API compatible with the version used when building the @cocalc/compute-server package
// since code (e.g., zeromq) built as part of that will be used by this node.
const NODE_VERSION = "20";

// see https://github.com/nvm-sh/nvm#install--update-script for this version:
const NVM_VERSION = "0.40.2";
export function installNode() {
  return `
mkdir -p /cocalc/nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v${NVM_VERSION}/install.sh | NVM_DIR=/cocalc/nvm PROFILE=/dev/null bash
set +v
source /cocalc/nvm/nvm.sh
nvm install --no-progress ${NODE_VERSION}
set -v
rm -rf /cocalc/nvm/.cache
`;
}

export function installDocker() {
  // See https://docs.docker.com/engine/install/ubuntu/
  return `
# Uninstall old versions, if any
apt-get remove -y  docker.io docker-doc docker-compose podman-docker containerd runc || true

# Add Docker's official GPG key:
apt-get update
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

export function installDockerGroup() {
  return `
# We use group 999 for docker inside the compute container,
# so that has to also be the case outside or docker without
# sudo won't work. We want to be very careful that only
# things in the docker group have access, obviously, so
# random system daemons can't become root.
docker_gid=$(getent group docker | cut -d: -f3)
# docker_gid is *something* since we just install docker above
if [ $docker_gid != '999' ]; then
    group999=$(getent group 999 | cut -d: -f1)
    if [ ! -z $group999 ]; then
        # some random thing has group 999, e.g., systemd-journal has it in ubuntu 24.04.
        for i in $(seq 998 -1 100); do
            if ! getent group $i > /dev/null; then
                echo "Available GID: $i"
                groupmod -g $i $group999
                break
            fi
        done
    fi
    groupmod -g 999 docker
    service docker restart
    chgrp docker /var/run/docker.sock
fi`;
}

// Extra support needed on some platforms to run Docker.
export function installNvidiaDocker({ gpu }: { gpu?: boolean }) {
  if (!gpu) {
    return "";
  }
  return `
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | tee /etc/apt/sources.list.d/nvidia-docker.list

apt-get update && apt-get install -y nvidia-docker2
systemctl restart docker
`;
}

// NOTE: we absolutely DO need "# Allow root to use FUSE mount of user" below.
// This is needed so that we can do a very fast bind mount as root of fast
// scratch directories on top of the slower fuse mounted home directory.
export function installUser() {
  return `
# Create the "user" if they do not already exist:

if ! id -u user >/dev/null 2>&1; then

  /usr/sbin/groupadd --gid=${UID} -o user
  /usr/sbin/useradd  --home-dir=/home/user --gid=${UID} --uid=${UID} --shell=/bin/bash user
  rm -rf /home/user && mkdir /home/user &&  chown ${UID}:${UID} -R /home/user

  # Allow to be root
  echo '%user ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers

  # Allow root to use FUSE mount of user
  sed -i 's/#user_allow_other/user_allow_other/g' /etc/fuse.conf

fi

# Add user to the docker group, so that they can
# use docker without having to do "sudo".  We do this
# every time since it seems to get removed by
# other steps.  Also, using usermod instead of sed is
# more robust.   This is needed, e.g., for our
# current ssh approach.
usermod -aG docker user
`;
}

export function installCoCalc({
  IMAGES,
  tag,
}: {
  IMAGES: Images;
  tag?: string;
}) {
  const pkg_x86_64 = IMAGES["cocalc"][getImageField("x86_64")];
  const pkg_arm64 = IMAGES["cocalc"][getImageField("arm64")];
  const npmTag = getTag({ image: "cocalc", IMAGES, tag });

  return `
set +v
NVM_DIR=/cocalc/nvm source /cocalc/nvm/nvm.sh
if [ $(uname -m) = "aarch64" ]; then
    npx -y ${pkg_arm64}@${npmTag} /cocalc
else
    npx -y ${pkg_x86_64}@${npmTag} /cocalc
fi;
set -v
`;
}

// This is assumed be after Docker is installed, but
// before any docker image is pulled.
export function installZpool({ cloud }: { cloud: Cloud }) {
  if (cloud != "hyperstack") {
    // Right now we've only implemented anything relevant for a zpool for hyperstack.
    // This will very likely change later, as there are many very cool ways using
    // ZFS can make things better.
    return "";
  }
  return `

cd /cocalc/hyperstack
./zpool-init.sh
`;
}

export function installMicroK8s({
  image,
  IMAGES,
  gpu,
}: {
  image: string;
  IMAGES: Images;
  gpu?: boolean;
}) {
  const microk8s = IMAGES[image]?.microk8s;
  if (!microk8s) {
    // not required for this image
    return "";
  }
  return `
setState install install-k8s '' 120 73

snap install microk8s --classic

if [ $? -ne 0 ]; then
    echo "FAILED to install microk8s!"
    exit 1;
fi

mkdir -p /data/.cache/.kube
microk8s config > /data/.cache/.kube/config
chown -R user. /data/.cache/.kube
chown user. /data/.cache /data
chmod og-rwx -R  /data/.cache/.kube

${gpu ? "microk8s enable gpu" : ""}

# Wait until Microk8s cluster is up and running
microk8s status --wait-ready
if [ $? -ne 0 ]; then
    echo "FAILED to install microk8s."
    exit 1;
fi

setState install install-k8s '' 120 75

if microk8s helm list  -n longhorn-system | grep -q "longhorn"; then

  echo "Longhorn distributed block storage for Kubernetes already installed"

else

  echo "Install Longhorn distributed block storage for Kubernetes"
  microk8s helm repo add longhorn https://charts.longhorn.io
  microk8s helm repo update
  microk8s kubectl create namespace longhorn-system
  microk8s helm install longhorn longhorn/longhorn --namespace longhorn-system \
    --set defaultSettings.defaultDataPath="/data/.longhorn" \
    --set csi.kubeletRootDir="/var/snap/microk8s/common/var/lib/kubelet"
  if [ $? -ne 0 ]; then
      echo "FAILED to install longhorm helm chart"
      exit 1;
  fi

  setState install install-k8s '' 120 80

  until microk8s kubectl get storageclass longhorn; do
    echo "Waiting for longhorn storageclass..."
    sleep 1
  done

  setState install install-k8s '' 120 85

  # Set longhorn storageclass to not be the default
  microk8s kubectl patch storageclass longhorn -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'

  # Create default storage class for longhorn with only 1 replica, which
  # makes sense for our single-node compute servers that are backed by
  # GCP disks (which are redundant), and soon will have instant snapshots.

cat <<EOF | microk8s kubectl apply -f -
kind: StorageClass
apiVersion: storage.k8s.io/v1
metadata:
  name: longhorn1
  annotations: {"storageclass.kubernetes.io/is-default-class":"true"}
provisioner: driver.longhorn.io
allowVolumeExpansion: true
reclaimPolicy: "Delete"
volumeBindingMode: Immediate
parameters:
  numberOfReplicas: "1"
  staleReplicaTimeout: "30"
  fromBackup: ""
  fsType: "ext4"
EOF

  # Install nfs-common, which is needed for read-write-many support
  apt-get update
  apt-get install -y nfs-common

fi

echo "Kubernetes installation complete."

setState install install-k8s '' 120 87

`;
}

export async function installConf({
  api_key,
  api_server,
  project_id,
  compute_server_id,
  hostname,
  exclude_from_sync,
  auth_token,
  proxy,
}) {
  const auth = await authorizedKeys(project_id);

  // We take care to base64 encode proxy config, so there
  // is no possible weird bash string escaping issue.  Since
  // proxy config could contain regexp's, this is a good idea.
  const base64ProxyConfig = Buffer.from(
    JSON.stringify(proxy, undefined, 2),
  ).toString("base64");

  return `
# Setup Current CoCalc Connection Configuration --
mkdir -p /cocalc/conf
# Lock /cocalc/conf down via permissions since it contains api keys and other secrets:
chmod o-rwx /cocalc/conf
chmod ug+rwx /cocalc/conf
echo "${api_key}" > /cocalc/conf/api_key
echo "${api_server}" > /cocalc/conf/api_server
echo "${project_id}" > /cocalc/conf/project_id
echo "${compute_server_id}" > /cocalc/conf/compute_server_id
echo "${hostname}" > /cocalc/conf/hostname
echo '${auth}' > /cocalc/conf/authorized_keys
echo '${auth_token}' > ${PROXY_AUTH_TOKEN_FILE}
echo '${base64ProxyConfig}' | base64 --decode > ${PROXY_CONFIG}
echo '${exclude_from_sync}' > /cocalc/conf/exclude_from_sync
chown ${UID}:${UID} -R /cocalc/conf
`;

  // have to use UID instead of "user" since user possibly isn't created yet.
}

/*
THIS works to install CUDA

https://developer.nvidia.com/cuda-downloads?target_os=Linux&target_arch=x86_64&Distribution=Ubuntu&target_version=24.04&target_type=deb_network

(NOTE: K80's don't work since they are too old and not supported!)

It takes about 10 minutes and 15GB of disk space are used on / afterwards.
The other approaches don't seem to work.

NOTE: We also install nvidia-container-toolkit, which isn't in the instructions
linked to above, because we want to support using Nvidia inside of Docker.

Links to all versions: https://developer.nvidia.com/cuda-toolkit-archive

**We always install the newest available version** of CUDA toolkits and kernel drivers.
*/

export function installCuda() {
  return `
curl -o cuda-keyring.deb https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/cuda-keyring_1.1-1_all.deb
dpkg -i cuda-keyring.deb
rm cuda-keyring.deb

curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg \
  && curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
apt-get update -y
apt-get -y install nvidia-container-toolkit

export NVIDIA_KERNEL_SOURCE=$(apt-cache search nvidia-kernel-source | awk '{ print $1 }' | tail -1)
apt-get --purge -y remove  $NVIDIA_KERNEL_SOURCE
apt-get -y autoremove
export NVIDIA_KERNEL_OPEN=$(apt-cache search nvidia-kernel-open | awk '{ print $1 }' | tail -1)
export CUDA_DRIVERS=$(apt-cache search cuda-drivers | grep CUDA | awk '{ print $1 }' | tail -1)
apt-get -y install $NVIDIA_KERNEL_OPEN $CUDA_DRIVERS
`;
}

export async function authorizedKeys(project_id: string) {
  const sshKeys = await getSshKeys(project_id);
  return (
    "# This file is managed by CoCalc.  Add keys in account prefs and project settings.\n# See https://doc.cocalc.com/account/ssh.html\n\n" +
    Object.values(sshKeys)
      .map(({ value }) => `# Added by CoCalc\n${value}`.trim())
      .join("\n") +
    "\n"
  );
}

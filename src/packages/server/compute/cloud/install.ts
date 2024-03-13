/*
This all assume Ubuntu 22.04.
*/

import getSshKeys from "@cocalc/server/projects/get-ssh-keys";
import { getImageField } from "@cocalc/util/db-schema/compute-servers";
import { getTag } from "@cocalc/server/compute/cloud/startup-script";
import type { Images } from "@cocalc/server/compute/images";

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
apt-get update -y
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
rm -f /etc/apt/keyrings/docker.gpg
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

export function installMicroK8s({
  image,
  IMAGES,
  gpu,
  imageBuild,
}: {
  image: string;
  IMAGES: Images;
  gpu?: boolean;
  imageBuild?: boolean;
}) {
  const microk8s = IMAGES[image]?.microk8s;
  if (!microk8s) {
    // not required for this image
    return "";
  }
  return `
setState install install-k8s '' 120 70

${imageBuild ? "" : generateCredentials()}

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

# Remove this node if we are building an image, so it isn't there
# when we instantiate it!
${imageBuild ? "" : "microk8s remove-node `hostname`"}
# SECURITY: When doing build remove all the client credentials. When credentials are
# missing, create new ones on first boot.  This is critical so one use can't
# connect to another user's Kubernetes cluster!!!
${imageBuild ? "rm /var/snap/microk8s/current/credentials/*.config" : ""}

echo "Kubernetes installation complete."

setState install install-k8s '' 120 87

`;
}

// I found this script at https://microk8s.io/docs/how-to-cis-harden,
// which recreates all the auth and other certs for microk8s
// using x509 auth, which is the default.  I could find absolutely
// no other way besides this for regenerating all auth, which was
// pretty annoying!

function generateCredentials() {
  return `
function refresh_microk8s_x509() {
  if [ ! -f /var/snap/microk8s/current/credentials/client.config ]; then
    mkdir -p /var/tmp/certs
    for user in client kubelet scheduler controller proxy; do
      openssl genrsa -out /var/tmp/certs/\${user}.key 2048
    done

    # client/admin cert
    subject="/CN=admin/O=system:masters"
    openssl req -new -sha256 -key /var/tmp/certs/client.key -out /var/tmp/certs/client.csr -subj \${subject}

    # kubelet cert
    hostname=$(hostname | tr '[:upper:]' '[:lower:]')
    echo "subjectAltName=DNS:$hostname" > /var/tmp/certs/kubelet.csr.conf
    subject="/CN=system:node:\${hostname}/O=system:nodes"
    openssl req -new -sha256 -key /var/tmp/certs/kubelet.key -out /var/tmp/certs/kubelet.csr -subj \${subject}

    # kube-proxy cert
    subject="/CN=system:kube-proxy"
    openssl req -new -sha256 -key /var/tmp/certs/proxy.key -out /var/tmp/certs/proxy.csr -subj \${subject}

    # kube-scheduler cert
    subject="/CN=system:kube-scheduler"
    openssl req -new -sha256 -key /var/tmp/certs/scheduler.key -out /var/tmp/certs/scheduler.csr -subj \${subject}

    # kube-controller-manager cert
    subject="/CN=system:kube-controller-manager"
    openssl req -new -sha256 -key /var/tmp/certs/controller.key -out /var/tmp/certs/controller.csr -subj \${subject}

    for user in client scheduler controller proxy; do
      openssl x509 -req -sha256 -in /var/tmp/certs/\${user}.csr -CA /var/snap/microk8s/current/certs/ca.crt -CAkey /var/snap/microk8s/current/certs/ca.key -CAcreateserial -out /var/tmp/certs/\${user}.crt -days 3650
    done

    openssl x509 -req -sha256 -in /var/tmp/certs/kubelet.csr -CA /var/snap/microk8s/current/certs/ca.crt -CAkey /var/snap/microk8s/current/certs/ca.key -CAcreateserial -out /var/tmp/certs/kubelet.crt -days 3650 -extfile /var/tmp/certs/kubelet.csr.conf

    create_x509_cert() {
      # Create a kubeconfig file with x509 auth
      # $1: the name of the config file
      # $2: the user to use al login
      # $3: path to certificate file
      # $4: path to certificate key file

      kubeconfig=$1
      user=$2
      cert=$3
      key=$4

      ca_data=$(cat /var/snap/microk8s/current/certs/ca.crt | base64 -w 0)
      cert_data=$(cat \${cert} | base64 -w 0)
      key_data=$(cat \${key} | base64 -w 0)
      config_file=/var/snap/microk8s/current/credentials/\${kubeconfig}

      cp /snap/microk8s/current/client-x509.config.template \${config_file}
      sed -i 's/CADATA/'"\${ca_data}"'/g' \${config_file}
      sed -i 's/NAME/'"\${user}"'/g' \${config_file}
      sed -i 's/PATHTOCERT/'"\${cert_data}"'/g' \${config_file}
      sed -i 's/PATHTOKEYCERT/'"\${key_data}"'/g' \${config_file}
      sed -i 's/client-certificate/client-certificate-data/g' \${config_file}
      sed -i 's/client-key/client-key-data/g' \${config_file}
    }

    create_x509_cert "client.config" "admin" /var/tmp/certs/client.crt /var/tmp/certs/client.key
    create_x509_cert "controller.config" "system:kube-controller-manager" /var/tmp/certs/controller.crt /var/tmp/certs/controller.key
    create_x509_cert "proxy.config" "system:kube-proxy" /var/tmp/certs/proxy.crt /var/tmp/certs/proxy.key
    create_x509_cert "scheduler.config" "system:kube-scheduler" /var/tmp/certs/scheduler.crt /var/tmp/certs/scheduler.key
    create_x509_cert "kubelet.config" "system:node:\${hostname}" /var/tmp/certs/kubelet.crt /var/tmp/certs/kubelet.key

    rm -rf /var/tmp/certs
    microk8s start

  fi
}

if [ -d /var/snap/microk8s/current/credentials -a ! -f /var/snap/microk8s/current/credentials/client.config ]; then
  echo "/var/snap/microk8s/current/credentials/client.config does not exist -- generating new microk8s x509 certs"
  refresh_microk8s_x509
else
  echo "/var/snap/microk8s/current/credentials/client.config exists -- using existing microk8s x509 certs"
fi
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
echo '${auth_token}' > /cocalc/conf/auth_token
echo '${exclude_from_sync}' > /cocalc/conf/exclude_from_sync
`;
}

/*
THIS works to install CUDA

https://developer.nvidia.com/cuda-downloads?target_os=Linux&target_arch=x86_64&Distribution=Ubuntu&target_version=22.04&target_type=deb_network

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
curl -o cuda-keyring.deb https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
dpkg -i cuda-keyring.deb
rm cuda-keyring.deb
apt-get update -y
export CUDA_VERSION=$(apt-cache madison cuda | awk '{ print $3 }' | head -1)
apt-get -y install cuda=$CUDA_VERSION nvidia-container-toolkit
export NVIDIA_KERNEL_SOURCE=$(apt-cache search nvidia-kernel-source | awk '{ print $1 }' | tail -1)
apt-get --purge -y remove  $NVIDIA_KERNEL_SOURCE
apt-get -y autoremove
export NVIDIA_KERNEL_OPEN=$(apt-cache search nvidia-kernel-open | awk '{ print $1 }' | tail -1)
export CUDA_DRIVERS=$(apt-cache search cuda-drivers | grep CUDA | awk '{ print $1 }' | tail -1)
apt-get -y install $NVIDIA_KERNEL_OPEN $CUDA_DRIVERS
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

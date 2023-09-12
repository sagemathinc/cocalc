/*
This all assume Ubuntu 22.04.
*/

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

/*
THIS works to install CUDA

https://developer.nvidia.com/cuda-downloads?target_os=Linux&target_arch=x86_64&Distribution=Ubuntu&target_version=22.04&target_type=deb_network

(NOTE: K80's don't work since they are too old and not supported!)

It takes about 10 minutes and 15GB of disk space are used on / afterwards.  The other approaches don't
seem to work.

NOTE: We also install nvidia-container-toolkit, which isn't in the instructions linked to above,
because we want to support using Nvidia inside of Docker.
*/

export function installCuda() {
  return `
curl -o cuda-keyring.deb https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
dpkg -i cuda-keyring.deb
apt-get update -y
apt-get -y install cuda nvidia-container-toolkit
rm cuda-keyring.deb
`;
}

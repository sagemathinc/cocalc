/*
1. The lambda stack install took about 15 minutes and used nearly 20GB of disk. The install finished

wget -nv -O- https://lambdalabs.com/install-lambda-stack.sh | I_AGREE_TO_THE_CUDNN_LICENSE=1 sh -

After a reboot it did NOT work:

root@cocalc-compute-server-6:/home/wstein# nvidia-smi
NVIDIA-SMI has failed because it couldn't communicate with the NVIDIA driver. Make sure that the latest NVIDIA driver is installed and running.



Attempt a more low level approach, following

https://askubuntu.com/questions/1077061/how-do-i-install-nvidia-and-cuda-drivers-into-ubuntu

So:

apt install nvidia-driver-535


and wait 15 minutes... but it only used about 1.5GB disk space.
Couldn't get this to work.

---

Another thing is here:  https://developer.nvidia.com/cuda-downloads?target_os=Linux&target_arch=x86_64&Distribution=Ubuntu&target_version=22.04&target_type=deb_network

wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb && dpkg -i cuda-keyring_1.1-1_all.deb && apt-get update && apt-get -y install cuda

Didn't work. Next try the run file. First attempt failed due to lack of gcc so we try again.

apt install gcc make dpkg-dev
wget https://developer.download.nvidia.com/compute/cuda/12.2.2/local_installers/cuda_12.2.2_535.104.05_linux.run
sudo sh cuda_12.2.2_535.104.05_linux.run --silent


I think they all failed because the K80 is too old.   All the other GPU's seem modern.  I should just not support K80 explicitly.
*/

export default function startupScript({
  api_key,
  project_id,
  nvidia,
}: {
  api_key?: string;
  project_id?: string;
  nvidia?: boolean;
}) {
  if (!api_key) {
    throw Error("api_key must be specified");
  }
  if (!project_id) {
    throw Error("project_id must be specified");
  }
  return `
#!/bin/bash

apt update -y
apt install -y docker.io
${
  nvidia
    ? "wget -nv -O- https://lambdalabs.com/install-lambda-stack.sh | I_AGREE_TO_THE_CUDNN_LICENSE=1 sh -"
    : ""
}
docker run  \
   -e API_KEY=${api_key} \
   -e PROJECT_ID=${project_id} \
   -e TERM_PATH=a.term \
   --privileged \
   --mount type=bind,source=/home,target=/home,bind-propagation=rshared \
   -v /var/run/docker.sock:/var/run/docker.sock \
   sagemathinc/compute
`;
}

/*
THIS works to install CUDA

https://developer.nvidia.com/cuda-downloads?target_os=Linux&target_arch=x86_64&Distribution=Ubuntu&target_version=22.04&target_type=deb_network

(NOTE: K80's don't work since they are too old and not supported!)

The steps:

wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
dpkg -i cuda-keyring_1.1-1_all.deb
apt-get update
apt-get -y install cuda

It takes about 15-20 minutes and 15GB of disk space are used on / afterwards.  The other approaches don't
seem to work.
*/

export default function startupScript({
  api_key,
  project_id,
}: {
  api_key?: string;
  project_id?: string;
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

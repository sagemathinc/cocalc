export default function startupScript({ api_key, project_id }) {
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

export default function startupScript({
  api_key,
  project_id,
  gpu,
}: {
  api_key?: string;
  project_id?: string;
  gpu?: boolean;
}) {
  if (!api_key) {
    throw Error("api_key must be specified");
  }
  if (!project_id) {
    throw Error("project_id must be specified");
  }
  return `
#!/bin/bash

${runCoCalcCompute({ api_key, project_id, gpu })}
`;
}

function runCoCalcCompute({ api_key, project_id, gpu }) {
  return `docker run  ${gpu ? " --gpus all " : ""} \
   -e API_KEY=${api_key} \
   -e PROJECT_ID=${project_id} \
   -e TERM_PATH=a.term \
   --privileged \
   --mount type=bind,source=/home,target=/home,bind-propagation=rshared \
   -v /var/run/docker.sock:/var/run/docker.sock \
   sagemathinc/compute`;
}


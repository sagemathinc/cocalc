import { build } from "@cocalc/backend/podman/build-container";

const Dockerfile = `
FROM docker.io/alpine:latest
RUN apk update && apk add --no-cache openssh-client rsync
`;

// const Dockerfile = `
// FROM ubuntu:25.04
// RUN  DEBIAN_FRONTEND=noninteractive apt-get update && apt-get install -y openssh-client rsync
// `;

export const sidecarImageName = "localhost/sidecar:0.1";

export async function init() {
  await build({ name: sidecarImageName, Dockerfile });
}

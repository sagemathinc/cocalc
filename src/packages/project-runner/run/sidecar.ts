/*
This sidecar solves an otherwise VERY tricky problem!

PROBLEM: We want to allow users to run fairly arbitrary root filesystem
images. In particular, those images might not include an ssh client -- in fact,
the default minimal images from Ubuntu, SUSE, and everybody else do NOT
include ssh. Mutagen fundamentally requires that we have an ssh client.
(For security reasons often container images do NOT want ssh installed.)

SOLUTION:  Instead of running mutagen only under the main root filesystem where
ssh might not be present (and might even be complicated to install), we
instead create a tiny alpine linux sidecar, which does have ssh installed.
It starts the mutagen daemon on startup.  Because it's in the same pod,
all the mutagen commands in the main pod suddenly "just work", because
they all use the daemon!  There's one caveat -- if you don't have ssh installed
and you stop/start the daemon, then of course things break. Deal with it.

FAILED APPROACH: I used dropbear to build a small static ssh client that was
wrapped in a script to make it behave like openssh-client. This
somewhat worked but was really flaky and it was quite difficult to get it
to work.  It was really painful.  So I deleted that.

COCALC-LITE?
The same problem will come up for cocalc-lite, where we aren't running
any containers.  But in that case, I think it is reasonable to require
the user to install ssh, since they will be running usually on a laptop
or remote server, where ssh is highly likely to be installed anyways (otherwise,
how did they get to that server).
*/

import { build } from "@cocalc/backend/podman/build-container";

const Dockerfile = `
FROM docker.io/alpine:latest
RUN apk update && apk add --no-cache openssh-client rsync
`;

export const sidecarImageName = "localhost/sidecar:0.3";

export async function init() {
  await build({ name: sidecarImageName, Dockerfile });
}

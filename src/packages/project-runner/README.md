# Project Runner

A project runner runs projects. It connects to a CoCalc installation,
copies the files for a project from the central file server to a local
cache. It then starts the project running and manages synchronizing
files with the central file server.

Running projects is done almost entirely in user space using rootless
podman. The only thing that involves sudo is creating an overlayfs
mount when starting a project, which requires the following sudo rule,
where "wstein" is replaced by the user that is running the project runner.

```
wstein ALL=(ALL) NOPASSWD: /bin/mount -t overlay *, /bin/umount *
```

**Absolutely everything else is done in user space right now.**
The only way that might change is if we make management of the
local storage cache more sophisticated. E.g., instead of one
big ext4 directory, it could be a btrfs filesystem with subvolumes,
quotas, compression, dedup (and a regular background dedup process using bees),
etc.  That would require `sudo btrfs access` but doesn't exist today.

## Running a Project Runner on a New Machine

How to run this on a random clean Google cloud Ubuntu machine. Everything below will
likely get automated into a single curl call with some sort of admin api key.

Install the dependencies, which are currently podman and rsync (and that's it):

```sh
apt update; apt install podman rsync
```

If the machine has a local SSD,

```sh
mkfs.ext4 /dev/disk/by-id/google-local-nvme-ssd-0
```

Make the storage location:

```
mkdir /projects
mount /dev/disk/by-id/google-local-nvme-ssd-0 /projects
chown wstein:wstein /projects
```

Copy data/secrets to ~data/secrets in your account from your main
cocalc server. Really just data/secrets/conat-password is needed
right now. TODO: we should have a notion of account and give the
project-runner only what subjects it needs, once we know what
they are.

Using mutagen on the machine running cocalc (serving on port 9001 say),
forward two ports from the main conat server to the new GCP node (say 34.53.6.50):

```sh
mutagen forward create 34.53.6.50:tcp::2222 tcp::2222
mutagen forward create 34.53.6.50:tcp::9001 tcp::9001
```

Use this script to run it from this directory:

```sh
set -ev

export COCALC_PROJECT_PATH=$HOME/projects
export DATA=~/data
export CONAT_SERVER=http://localhost:9001
export DEBUG=cocalc:*,-cocalc:silly:*
export DEBUG_CONSOLE=yes

# Run the binary created via "pnpm build-all" in the project-runner directory:

./cocalc-project-runner-0.1.4-x86_64-linux/cocalc-project-runner
```

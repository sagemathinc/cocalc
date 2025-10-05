set -ev

# We have to remount the filesystem with the subvol option
# so that it will be possible to fully see the filesystem instead
# of the container.

NAME=${2:=bees}

echo $NAME
# UUID=$(blkid -s UUID -o value $1)
# sudo mkdir -p /var/lib/bees/$UUID || true
# sudo umount /var/lib/bees/$UUID || true
# sudo mount /dev/disk/by-uuid/$UUID /var/lib/bees/$UUID -o subvol=/

# Now run the container:
sudo podman run -d --name $NAME \
  --privileged \
  --userns=host \
  --security-opt label=disable \
  --cpus=2 \
  --memory=1g \
  -e FS_PATH=/fs \
  -e BEESHOME_NAME=.beeshome \
  -e HASH_TABLE_SIZE=512M \
  -e MAX_CPU_PERCENT=50 \
  -e BEES_ARGS="-a -v" \
  -v $1:/fs:rw,rshared \
  docker.io/sagemathinc/bees-runner

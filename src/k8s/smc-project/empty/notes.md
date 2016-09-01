# "empty" compute image for project and "fakeroot"

* read-only mount a full copy of "/" of the actual compute project image into /mnt/compute-disk

* copy the files from a container to this compute-disk like this:

  1. docker create smc-project-base:latest
     to get the hash of the container
  2. sudo docker cp [THIS HASH]:/ /mnt/compute-disk/

  Before that, obvisouly, read-write mount compute-disk and empty it (reformatting?)

       sudo umount /mnt/compute-disk/
       sudo mkfs.ext4 -F -E lazy_itable_init=0,lazy_journal_init=0,discard /dev/disk/by-id/google-compute-disk
       sudo mount -o discard,defaults /dev/disk/by-id/google-compute-disk /mnt/compute-disk

  After that, read-only mount

       sudo mount -o remount,discard,defaults,ro /dev/disk/by-id/google-compute-disk /mnt/compute-disk

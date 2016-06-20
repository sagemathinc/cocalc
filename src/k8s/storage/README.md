# Iscsi storage test

## Configuring and running the iscsi server

For the image to work, you must do this on the HOST VM:

    apt-get install iscsitarget
    sed -i -e 's/ISCSITARGET_ENABLE=false/ISCSITARGET_ENABLE=true/' /etc/default/iscsitarget
    sudo systemctl disable iscsitarget
    sudo service iscsitarget stop
    sudo modprobe iscsi_trgt

Otherwise, the relevant kernel modules aren't available.

To build and run in Docker on local machine:

    docker build -t storage .
    docker run --net=host --privileged -i -t storage

Once this runs, do

    sudo iscsiadm -m discovery -t st -p localhost

on the *host* to see the available iscsi devices to mount:

    127.0.0.1:3260,1 iqn.2016-06.com.sagemath:test.lun0
    10.240.0.37:3260,1 iqn.2016-06.com.sagemath:test.lun0
    172.17.0.1:3260,1 iqn.2016-06.com.sagemath:test.lun0

## Mounting the iSCSI served block device from host of the docker machine

### 1. Init

    apt install open-iscsi

then change `/etc/iscsi/iscsid.conf` to have

    node.startup = automatic

and do `service open-iscsi restart` then

    iscsiadm -m discovery -t st -p 127.0.0.1
    iscsiadm -m node

### 2. Configure

    iscsiadm -m node --targetname "iqn.2016-06.com.sagemath:test.lun0" --portal "127.0.0.1:3260" --op=update --name node.session.auth.authmethod --value=CHAP
    iscsiadm -m node --targetname "iqn.2016-06.com.sagemath:test.lun0" --portal "127.0.0.1:3260" --op=update --name node.session.auth.username --value=smc
    iscsiadm -m node --targetname "iqn.2016-06.com.sagemath:test.lun0" --portal "127.0.0.1:3260" --op=update --name node.session.auth.password --value=smc

### 3. Connect

    iscsiadm -m node --targetname "iqn.2016-06.com.sagemath:test.lun0" --portal "127.0.0.1:3260" --login

### 4. Test

Show the device with `fdisk -l`; let's **assume** `/dev/sdb` below, but don't just copy paste if it isn't or you will suffer greatly!

Test:

    # /sbin/hdparm -t /dev/sdb
    /dev/sdb:
    Timing buffered disk reads: 826 MB in  3.01 seconds = 274.86 MB/sec
    # mkfs.ext4 /dev/sdb
    # mkdir -p /mnt/test; mount /dev/sdb /mnt/test
    # cd /mnt/test
    # fio --randrepeat=1 --ioengine=libaio --direct=1 --gtod_reduce=1 --name=test --filename=test --bs=4k --iodepth=16 --size=512M --readwrite=randrw --rwmixread=75
    [5210/1740/0 iops]



### 5. Disconnect

    iscsiadm -m node --targetname "iqn.2016-06.com.sagemath:test.lun0" --portal "127.0.0.1:3260" --logout


## Mounting in a k8s container, rather than on a local machine.


## References

- https://hub.docker.com/r/dreamcat4/iscsi/
- SMC internal: https://cloud.sagemath.com/projects/ccd4d4a4-29a8-4c39-85c2-a630cb1e9b6c/files/iSCSI/iscsi-test-1.md
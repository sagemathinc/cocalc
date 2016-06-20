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

References:

  - https://hub.docker.com/r/dreamcat4/iscsi/
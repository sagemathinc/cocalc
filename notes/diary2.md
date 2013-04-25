How to setup SMC from scratch on a single new Linux machine:

1. Install packages:

   apt-get install iperf dpkg-dev texlive make m4 g++ gfortran liblzo2-dev libssl-dev libreadline-dev  libsqlite3-dev libncurses5-dev emacs git zlib1g-dev openjdk-7-jre libbz2-dev

2. Build as usual.

3.  I created the database schema from scratch by (1) fixing some "?"'s in db_schema.cql that were leading to
  errors, then (2) running this:
     echo "require('./node_modules/tests/test_cassandra').setUp()" |coffee

4. Create ssh stuff:

   - Put scripts/create_unix_user.py in /root/
   - Copy over the .ssh stuff from my old laptop.
   - Put ssh keys in /root/skel
   - Built /root/skel/.sagemathcloud, so new projects don't require a build.


---
# April 15, 2013

I'm thinking about the end game.

---
# April 25, 2013 -- deployment day notes

VM's
     # check that no base vm is running
     virsh --connect qemu:///session list --all
     export PREV=salvus-20130402; export NAME=salvus-20130425; qemu-img create -b ~/vm/images/base/$PREV.img -f qcow2 ~/vm/images/base/$NAME.img
     virt-install --cpu host --network user,model=virtio --name $NAME --vcpus=16 --ram 32768 --import --disk ~/vm/images/base/$NAME.img,device=disk,bus=virtio,format=qcow2,cache=writeback --noautoconsole  --graphics vnc,port=8121


     virsh -c qemu:///session qemu-monitor-command --hmp $NAME 'hostfwd_add ::2222-:22'; ssh localhost -p 2222

       # IMPORTANT!
       sudo chown og-rwx -R salvus

       sudo apt-get update; sudo apt-get upgrade;
       sudo reboot -h now
       cd salvus/salvus; git pull https://github.com/williamstein/salvus.git
       . salvus-env


# for example:
       ./build.py --build_stunnel --build_nodejs --build_nodejs_packages --build_haproxy --build_nginx --build_cassandra --build_python_packages

     virsh --connect qemu:///session undefine $NAME
     virsh --connect qemu:///session destroy $NAME
     virsh --connect qemu:///session list --all

     cd ~/salvus/salvus; . salvus-env;  push_vm_images_base.py






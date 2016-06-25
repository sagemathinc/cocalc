# Installing ZFS on Google's Kubernetes Image

The **stupid** Google Compute Engine Kubernetes Debian images
don't include the kernel headers for their live kernel in the
Debian repo.  Somebody at Google was lazy.  In any case,
here is how to build something that installs ZFS on the
k8s nodes.

Create a VM using the same image as the k8s nodes:
```
gcloud compute instances create zfs-build\
  --image container-v1-3-v20160517 \
  --image-project google-containers \
  --zone us-central1-c \
  --machine-type n1-highcpu-4\
  --preemptible
```

(Use `gcloud compute images list --project google-containers` to find the ` container-v1-3-v20160517` image name.)

Ssh into it, become root via `sudo su`, and install relevant tools, downgrade the kernel to one with sources, and reboot.  Do each of the following as root and when it asks for confirmation about removing the kernel, DO IT.

```
apt-get update && apt-get remove -y iscsitarget-dkms && apt-get install -y linux-headers-3.16.0-0.bpo.4-amd64 linux-image-3.16.0-0.bpo.4-amd64 build-essential gawk alien fakeroot gdebi zlib1g-dev uuid-dev libattr1-dev libblkid-dev libselinux-dev libudev-dev parted lsscsi wget ksh dh-autoreconf && apt-get remove -y linux-image-3.16.0-4-amd64 && reboot
```

Ssh back in, become root via `sudo su` and build and install the latest ZFS from github:
```
cd /tmp && mkdir -p zfs && cd zfs && git clone https://github.com/zfsonlinux/spl.git && git clone https://github.com/zfsonlinux/zfs.git && cd spl && ./autogen.sh && cd ../zfs && ./autogen.sh && cd .. && cd spl && ./configure && make -j4 pkg-utils &&  make -j4 pkg-kmod && dpkg -i *.deb && cd .. && cd zfs && ./configure && make -j4 pkg-utils && make -j4 pkg-kmod && make -j4 deb-utils && dpkg -i *.deb && cd ..
```

Create a tarball that can be used to install ZFS on the k8s nodes:
```
cd /tmp/zfs && mkdir -p zfs-dist/pkg && cp zfs/lib*.deb zfs/zfs_*.deb zfs-dist/pkg/ && cd /lib/modules/3.16.0-0.bpo.4-amd64 && tar cvf /tmp/zfs/zfs-dist/kmod.tar extra && cd /tmp/zfs/zfs-dist && echo 'dpkg -i pkg/*.deb && CUR=`pwd` && cd /lib/modules/3.16.0-4-amd64/ && tar xvf $CUR/kmod.tar && depmod -a && modprobe zfs' > install.sh && chmod +x ./install.sh && cd /tmp/zfs/ && tar cvf zfs-dist.tar zfs-dist
```

Doing all this results in `/tmp/zfs/zfs-dist.tar`, which you can extra and type `./install.sh` in on k8s nodes, in order to install ZFS support.  A simple test that ZFS is (probably) working:
```
> sudo zpool list
no pools available
```


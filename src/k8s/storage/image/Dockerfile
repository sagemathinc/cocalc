FROM ubuntu:16.04

USER root

MAINTAINER William Stein <wstein@sagemath.com>

RUN \
  apt-get update && apt-get install -y nfs-kernel-server rpcbind

RUN \
  mkdir -p /projects

# Script to configure nfs.
ADD run_nfs.sh /run_nfs.sh
ADD services /etc/services
ADD ssh /root/.ssh

# expose mountd 20048/tcp and nfsd 2049/tcp and rpcbind 111/tcp
EXPOSE 2049/tcp 20048/tcp 111/tcp 111/udp 22/tcp 22/udp

RUN \
  apt-get install -y ssh

# Start nfs server
ENTRYPOINT ["./run_nfs.sh", "/projects"]


FROM ubuntu:16.04

USER root

MAINTAINER William Stein <wstein@sagemath.com>

RUN \
  apt-get update && \
  apt-get install -y python-software-properties software-properties-common && \
  add-apt-repository -y ppa:gluster/glusterfs-3.7 && \
  apt-get update && \
  apt-get install -y glusterfs-server



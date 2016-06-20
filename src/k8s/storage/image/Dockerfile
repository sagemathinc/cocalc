FROM ubuntu:16.04

USER root

MAINTAINER William Stein <wstein@sagemath.com>

RUN \
  apt-get update && apt-get install -y iscsitarget

# Copy configuration files
COPY iscsitarget /etc/default/iscsitarget
COPY ietd.conf   /etc/ietd/ietd.conf
COPY run.sh      /run.sh

EXPOSE 860 3260

# Run ietd server
CMD /run.sh

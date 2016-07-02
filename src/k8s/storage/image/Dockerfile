FROM ubuntu:16.04

USER root

MAINTAINER William Stein <wstein@sagemath.com>

RUN apt-get update && apt-get install -y ssh bup

RUN mkdir -p /projects

# Script to configure nfs.
ADD run.sh /run.sh

EXPOSE 22/tcp 22/udp

# Start nfs server
ENTRYPOINT ["./run.sh"]


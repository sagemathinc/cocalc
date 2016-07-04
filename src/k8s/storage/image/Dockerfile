FROM ubuntu:16.04

USER root

MAINTAINER William Stein <wstein@sagemath.com>

RUN apt-get update && apt-get install -y ssh bup python3

# Script to configure vm and run backup tool, sshfs server, etc.
ADD run.py /run.py

# Expose ssh ports
EXPOSE 22/tcp 22/udp

CMD /run.py



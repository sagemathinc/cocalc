FROM ubuntu:16.04

USER root

MAINTAINER William Stein <wstein@sagemath.com>

RUN apt-get update && apt-get install -y ssh

RUN mkdir /var/run/sshd

ADD sshd_config.custom /etc/ssh/sshd_config.custom
ADD run.sh /run.sh

# Expose ssh ports
EXPOSE 22/tcp 22/udp

CMD ./run.sh



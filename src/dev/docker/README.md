# SageMathCloud Docker image

This is a self-contained single-image multi-user SageMathCloud server.

**STATUS:**
  - Actually should be reasonably secure -- the database has a long random password, user accounts are separate, etc.
  - No quotas are implemented except idle timeout.
  - Sagetex not setup yet.

## Instructions

**Technical Note: This Docker image only supports 64-bit Intel.**

To download the latest docker image (about 7GB):

    docker pull  williamstein/sagemathcloud

To store your local SMC data in the directory ~/smc, and run SageMathCloud (via docker), make sure you have about 7GB disk space free, then type:

    docker run --name=smc -v ~/smc:/projects -p 80:80 -p 443:443 williamstein/sagemathcloud

Then connect to localhost.   You can also do this to run it in the backeground:

    docker run --name=smc -d -v ~/smc:/projects -p 80:80 -p 443:443 williamstein/sagemathcloud

The name smc makes it so you can refer to the container and use commands like:

    $ docker stop smc
    $ docker start smc

If you're running this docker image on a remote server and want to use
ssh port forwarding to connect, type

    ssh -L 8080:localhost:80 username@remote_server

then open your web browser to http://localhost:8080

### Make all users admins

    $ docker exec -it 9eff7133bbd6 bash
    root@9eff7133bbd6:/# cd /smc/src
    root@9eff7133bbd6:/smc/src# . smc-env
    root@9eff7133bbd6:/smc/src# coffee
    coffee> require 'c'; db()
    coffee> db.table('accounts').update(groups:['admin']).run(done())

Refresh your browser, and then you should see an "Admin edit..." button in any project's settings.

## Issues

  - gp doesn't work at all, due to the Ubuntu ppa being broken


## Build

Build the image

    make build

Run the image (to test)

    make run

How I pushed this

    docker tag smc:latest williamstein/sagemathcloud
    docker login --username=williamstein
    docker push  williamstein/sagemathcloud

# SageMathCloud Docker image

This is a self-contained single-image multi-user SageMathCloud server.

**STATUS:**
  - This is _**not blatantly insecure**_: the database has a long random password, user accounts are separate, ssl communication is supported by default, etc.
  - That said, **a determined user with an account can very likely access or change files of other users in the same container!** Use this for personal use, behind a firewall, or with an account creation token, so that only other people you trust create accounts.  Don't make one of these publicly available with important data in it and no account creation token!
  - There are no quotas are implemented except idle timeout.
  - See the [open docker-related SageMathCloud issues](https://github.com/sagemathinc/smc/issues?q=is%3Aopen+is%3Aissue+label%3AA-docker), which may include several issues, including no sagetex support, missing Jupyter kernels, etc.

## Instructions

**Technical Note: This Docker image only supports 64-bit Intel.**

Install Docker on your computer (e.g., `apt-get install docker.io` on Ubuntu).   Make sure you have at least 7GB disk space free, then type 

    docker run --name=smc -d -v ~/smc:/projects -p 80:80 -p 443:443 sagemathinc/sagemathcloud

(If you get an error about the Docker daemon, instead run `sudo docker ...`.)

The above command will first download the image, then start SageMathCloud, storing your data in the directory `~/smc` on your computer.  Once your local SageMathCloud is running, open your web browser to http://localhost (or https://localhost). 

The docker container is called `smc` and you can refer to the container and use commands like:

    $ docker stop smc
    $ docker start smc

You can watch the logs:

    $ docker logs smc -f

If you're running this docker image on a remote server and want to use ssh port forwarding to connect, type

    ssh -L 8080:localhost:80 username@remote_server

then open your web browser to http://localhost:8080

### Make all users admins

Get a bash shell insider the container, then connect to the database and make all users admins as follows:

    $ docker exec -it 9eff7133bbd6 bash
    root@9eff7133bbd6:/# cd /smc/src
    root@9eff7133bbd6:/smc/src# . smc-env
    root@9eff7133bbd6:/smc/src# coffee
    coffee> require 'c'; db()
    coffee> db.table('accounts').update(groups:['admin']).run(done())

Refresh your browser, and then you should see an "Admin edit..." button in any project's settings.

## Your data

If you started the container as above, there will be a directory ~/smc on your host computer that contains **all** data and files related to your projects and users -- go ahead and verify that it is there before ugrading.   It might look like this:

    Williams-MacBook-Pro:~ wstein$ ls smc
    be889c14-dc96-4538-989b-4117ffe84148	rethinkdb    conf

The directory `rethinkdb` contains the database files, so all projects, users, file editing history, etc.  The directory conf contains some secrets and log files.  There will also be one directory (like `be889c14-dc96-4538-989b-4117ffe84148`) for each
project that is created.

## Upgrade


To get the newest image, do this (which will take some time):

    docker pull  sagemathinc/sagemathcloud

Once done, you can delete and recreate your smc container.  This will not delete any of your project or user data, which you confirmed above is in ~/smc.

    docker stop smc
    docker rm smc
    docker run --name=smc -d -v ~/smc:/projects -p 80:80 -p 443:443 sagemathinc/sagemathcloud


## Build

This section is for SageMathCloud developers.

Build the image

    make build

Run the image (to test)

    make run

How I pushed this

    docker tag smc:latest sagemathinc/sagemathcloud
    docker login --username=sagemathinc
    docker push  sagemathinc/sagemathcloud

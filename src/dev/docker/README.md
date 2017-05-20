# SageMathCloud Docker image

This is a self-contained single-image multi-user SageMathCloud server.

**STATUS:**
  - This is _**not blatantly insecure**_: the database has a long random password, user accounts are separate, ssl communication is supported by default, etc.
  - That said, **a determined user with an account can very likely access or change files of other users in the same container!** Use this for personal use, behind a firewall, or with an account creation token, so that only other people you trust create accounts.  Don't make one of these publicly available with important data in it and no account creation token!
  - There are no quotas except idle timeout.
  - See the [open docker-related SageMathCloud issues](https://github.com/sagemathinc/smc/issues?q=is%3Aopen+is%3Aissue+label%3AA-docker), which may include several issues.

## Instructions

**Technical Note: This Docker image only supports 64-bit Intel.**

Install Docker on your computer (e.g., `apt-get install docker.io` on Ubuntu).   Make sure you have at least 7GB disk space free, then type

    docker run --name=smc -d -v ~/smc:/projects -p 80:80 -p 443:443 sagemathinc/sagemathcloud

(If you get an error about the Docker daemon, instead run `sudo docker ...`.)

The above command will first download the image, then start SageMathCloud, storing your data in the directory `~/smc` on your computer. (If you want to store your worksheets and edit history elsewhere, change ~/smc to something else.)  Once your local SageMathCloud is running, open your web browser to http://localhost (or https://localhost).

The docker container is called `smc` and you can refer to the container and use commands like:

    $ docker stop smc
    $ docker start smc

You can watch the logs:

    $ docker logs smc -f

### Clock skew on OS X

It is **critical** that the Docker container have the correct time, since SMC assumes that the server has the correct time.
On a laptop running Docker under OS X, the clock will get messed up any time you suspend/resume your laptop.  A very easy to install workaround is at https://github.com/arunvelsriram/docker-time-sync-agent/.


### SSH port forwarding

If you're running this docker image on a remote server and want to use ssh port forwarding to connect, type

    ssh -L 8080:localhost:80 username@remote_server

then open your web browser to http://localhost:8080

For **much enhanced security**, instead make the container only listen on localhost

    docker stop smc
    docker rm smc
    docker run --name=smc -d -v ~/smc:/projects -p  127.0.0.1:80:80 sagemathinc/sagemathcloud

Then the **only way** to access your SMC server is to type the following on your local computer

    ssh -L 8080:localhost:80 username@remote_server

and open your web browser to http://localhost:8080

### Make a user an admin

Get a bash shell insider the container, then connect to the database and make a user (me!) an admin as follows:

    $ docker exec -it smc bash
    root@931045eda11f:/# coffee
    coffee> require 'c'; db()
    coffee> db.make_user_admin(email_address:'wstein@gmail.com', cb:done())

Obviously, you should really make the user you created (with its email address) an admin, not me!
Refresh your browser, and then you should see an extra admin panel in the lower right of accounts settings; you can also open any project by directly visiting its URL.

#### Account Creation Token

After making your main account an admin as above, search for "Account Creation Token" in your account settings. Put some random  string there and other people will not be able to create accounts in your SMC container, without knowing that token.

## Your data

If you started the container as above, there will be a directory ~/smc on your host computer that contains **all** data and files related to your projects and users -- go ahead and verify that it is there before ugrading.   It might look like this:

    Williams-MacBook-Pro:~ wstein$ ls smc
    be889c14-dc96-4538-989b-4117ffe84148	postgres    conf

The directory `postgres` contains the database files, so all projects, users, file editing history, etc.  The directory conf contains some secrets and log files.  There will also be one directory (like `be889c14-dc96-4538-989b-4117ffe84148`) for each project that is created.

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

    make build-full   # or make build

Run the image (to test)

    make run

How I pushed this

    docker tag smc:latest sagemathinc/sagemathcloud
    docker login --username=sagemathinc
    docker push  sagemathinc/sagemathcloud

Also to build at a specific commit.

    docker build --build-arg commit=121b564a6b08942849372b9ffdcdddd7194b3e89 -t smc .

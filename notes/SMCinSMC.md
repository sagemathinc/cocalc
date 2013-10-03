# SMC in SMC, by William Stein

You get to be the first person in the world besides me (William Stein) to actually
develop on cloud.sagemath.com... from within cloud.sagemath.com.

Here's how it works:


# To start/stop/restart all daemons running:

    cd salvus/salvus
    ipython
    import admin; s = admin.Services('conf/deploy_project/', passwd=False)
    s.start('all')
    s.stop('all')
    s.restart('all')
    s.status('all')

It should never be necessary to "properly" shut anything down.  Every service assumes that it could
be "kill -9'd" or loose power at any moment.


# Once everything is started, go to this URL, make an account, and create a project:

    https://cloud.sagemath.com/2cb3aa87-48de-482c-81a3-eb748d2707d2/port/8400/

File-wise, *all* projects are actually the same -- and they are all *this* project in cloud.sagemath.
It probably only makes sense to open exactly one projects from the above URL -- opening multiple
things might cause trouble, and isn't needed.

The state files for that project are in ~/.sagemathcloud-local  (instead of ~/.sagemathcloud).
Restarting that project doesn't impact the project you're doing development from (e.g., I explicitly
disabled killing on processes on restart for this).

## BE CAREFUL

It can be confusing since your files in the main project are the same as in

     https://cloud.sagemath.com/2cb3aa87-48de-482c-81a3-eb748d2707d2/port/8400/

However, the terminal sessions, the editing sessions, sync, etc., are all completely
different.   When doing development, as much as possible I tend to work completely
through (my own version of)

    https://cloud.sagemath.com/2cb3aa87-48de-482c-81a3-eb748d2707d2/port/8400/

in order to better test the changes I've just made!


# How to automatically rebuild the index.html, salvus.min.js, etc., files whenever you change any HTML/CSS/Javascript

Do the following to start a process that watches for changes to all relevant files, then builds (efficiently) just
what needs to be built.   You'll have to refresh https://cloud.sagemath.com/2cb3aa87-48de-482c-81a3-eb748d2707d2/port/8400/
to get new updates, and you also have to watch the below to see if there are errors, and also that it is done (it usually
takes at most 3 seconds to rebuild):

    cd salvus/salvus
    ./w

# Security

## No Stunnel
The stunnel (ssl termination) component of cloud.sagemath.com isn't run here, since it is not necessary, as
all traffic is already ssl encrypted by virtual of cloud.sagemath.com/project_id/port being encrypted.

## Password

The password you choose when you make an acocunt at

    https://cloud.sagemath.com/2cb3aa87-48de-482c-81a3-eb748d2707d2/port/8400/

doesn't have to be too secure, since *only* people with write access to this project can even visit that page.

## Cassandra auth

Cassandra passwords are in

    salvus/salvus/data/secrets/cassandra/

and to start a direct shell on cassandra see

    salvus/salvus/cqlsh_connect

## IMPORTANT: Keep the internal project_id secret

The main issue I'm aware of with developing "SMC in SMC" is that if a user on the same VM new the uuid of
a running project inside the new SMC, i.e., the uuid of a running project that you see at

     https://cloud.sagemath.com/2cb3aa87-48de-482c-81a3-eb748d2707d2/port/8400/

(so *NOT* 2cb3aa87-48de-482c-81a3-eb748d2707d2), then:

   (1) if you run ipython-notebook, they would have total access to your project.

   (2) they would have total *read only* access to the project via the raw http server.
       Of course, that would grant write access, since they could just read the ssh private key.

There's no reason another user should be able to figure out the project id though, since it's stored in
a directory that is only readable by you, and also in a database that requires login.

As far as I know, cloud.sagemath has no obvious-to-me gaping security vulnerabilities.  However, there
are a few places like this, where there are "almost vulnerabilities".
In the long run, I plan to eliminate all of those too.



# Github

You'll probably want to change the remote, etc., to match your github salvus project...

When you make changes, I can pull from that.


# Problems

You can easily "mess everything up" :-).  Just let me know, and I can just pop into the project and fix things, etc., since
I understand the overall system.
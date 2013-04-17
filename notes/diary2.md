How to setup SMC from scratch on a single new Linux machine:

1. Install packages:

   apt-get install iperf dpkg-dev texlive make m4 g++ gfortran liblzo2-dev libssl-dev libreadline-dev  libsqlite3-dev libncurses5-dev emacs git zlib1g-dev openjdk-7
-jre libbz2-dev

2. Build as usual.

3.  I created the database schema from scratch by (1) fixing some "?"'s in db_schema.cql that were leading to
  errors, then (2) running this:
     echo "require('./node_modules/tests/test_cassandra').setUp()" |coffee

4. Create ssh stuff:

   - Put scripts/create_unix_user.py in /root/
   - Copy over the .ssh stuff from my old laptop.
   - Put ssh keys in /root/skel
   - Built /root/skel/.sagemathcloud, so new projects don't require a build.


---
# April 15, 2013

I'm thinking about the end game.







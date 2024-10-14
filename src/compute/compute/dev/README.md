The scripts here are helpful for developing the compute\-server manager, which is defined in this package.

1. Create the directory /tmp/user and make sure you can read it. Maybe even mount it from the target project.

2. The conf/ directory here has the same files as on /cocalc/conf in an actual compute\-server, except:
     - replace api_server by something like `http://localhost:5000/6659c2e3-ff5e-4bb4-9a43-8830aa951282/port/5000`, where the port is what you're using for your dev server and the project id is of your dev server. The point is that we're going to connect directly without going through some external server.
     - api_key: the one from an actual server will get deleted when you turn that server off, so make a different project level api key.

   Type `tar xvf conf.tar` to get a template for the conf directory.  You will need to change the contents
   of all the files you get, as mentioned above!

This is potentially confusing, and when developing this it was 10x worse... Maybe you'll be confused for 2 hours instead of 2 days.

3. Run each of the following four shell scripts in different terminals, in order.

```sh
1-websocketfs.sh
2-syncfs.sh
3-compute.sh
4-startup-script.sh
```

However, a bunch of things are likely to go wrong. The scripts `1-websocketfs.sh` and `2-syncfs.sh` will definitely fail if support for FUSE isn't enabled for normal users where you are working! Test bindfs locally. You probably  have to add `user_allow_other` to `/etc/fuse.conf`. For `2-syncfs.sh`, you must also install unionfs-fuse via `sudo apt install unionfs-fuse` . Also, you need to do the following so that testing of tmp being a "fast local data directory that isn't sync"'d can be done:

```
~/cocalc/src/compute/compute/dev$ sudo mkdir /data/tmp
~/cocalc/src/compute/compute/dev$ sudo chown `whoami`:`whoami` /data/tmp
```

Once you get the 4 scripts above to run, the net result is basically the same as using a compute server, but you can run it all locally, and debugging is massively easier. Without something like this, development is impossible, and even figuring out what configuration goes where could cost me days of confusion (even though I wrote it all!). It's complicated.

For debugging set the DEBUG env variable to different things according to the debug npm module. E.g.,

```sh
DEBUG=* 2-syncfs.sh
```

The scripts here are helpful for developing the compute\-server manager, which is defined in this package.

1. Create the directory /tmp/user and make sure you can read it. Maybe even mount it from the target project.

2. Make the conf/ directory here, with the same files as on /cocalc/conf in an actual compute\-server...

3. Run each of the following four shell scripts in different terminals, in order.

```sh
1-websocketfs.sh
2-syncfs.sh
3-compute.sh
4-startup-script.sh
```

The net result is basically the same as using a compute server, but you can run it all locally, and debugging is massively easier. Without something like this, development is impossible, and even figuring out what configuration goes where could cost me days of confusion (even though I wrote it all!). It's complicated.

For debugging set the DEBUG env variable to different things according to the debug npm module.  E.g.,

```sh
DEBUG=* 2-syncfs.sh
```

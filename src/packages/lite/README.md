# CoCalc Lite


## Build

Set the version in package.json.

Then build the relevant code and node_modules:

```sh
pnpm build-lite
```

This will produce a file `build/lite/cocalc-lite....tar.xz` that is the built source code and contents of node_modules folders needed to run cocalc-lite.
You could untar this somewhere with the same version of node used to build it and run the script `lite/bin/start.js` in the tarball to run cocalc-lite.

Next build a Single Executable Application (SEA), which combines the above tarball with the copy of nodejs you're using in to a single binary:

```sh
pnpm build-sea
```

That will build a binary in `build/sea/cocalc-lite...`.  You can run it.  You can also copy it to any reasonably modern Linux computer with the same processor architecture and run it.

## MacOS

The above is also supported on MacOS.  However, the SEA needs to be signed, sealed, packaged, etc. in order for anybody to use it.  This requires buying a dev cert from Apple for $99/year, etc.  There is a script that hopefully automates this, once you have properly set everything up.
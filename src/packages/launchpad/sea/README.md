Self extracting single file compressed CoCalc Launchpad executable based on
https://nodejs.org/api/single-executable-applications.html

Assumptions:

- you have built `bundle.tar.xz`
- you have installed nvm.sh with node version 24

Then run `./build-sea.sh`.

The resulting binary has no dependencies and should run on Ubuntu 20.04+
and recent macOS versions.

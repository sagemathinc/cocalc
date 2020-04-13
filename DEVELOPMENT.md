# Development Information

- Source code is in the `src/` subdirectory.
- Additional development information is in the `docs/` directory.

## Activity

[![Throughput Graph](https://graphs.waffle.io/sagemathinc/smc/throughput.svg)](https://waffle.io/sagemathinc/smc/metrics/throughput)

## Development environments

Nothing is fully supported yet, but this is the goal.
The directories below have scripts to enable development
in various contexts:

- src/dev/project -- for developing CoCalc from any project right on CoCalc!  This is how we do most CoCalc dev work and is the best supported.

- src/dev/single -- for developing CoCalc on a single computer, e.g., a VM.   Must have sudo, and install things system-wide.  Each project is a different Linux account.

- src/dev/docker -- for running CoCalc in Docker.  Not really intended for development use...

- src/dev/laptop -- for development on your personal laptop (or desktop) that is not public; zero concern about security. No sudo setup.  Works on Linux and OS X.  Currently deprecated/not updated.

- src/dev/smc -- related to the actual live CoCalc deployment, which runs on many nodes, and uses haproxy and nginx. (Will be deprecated)

## The Components of CoCalc

### Node.js modules

- **smc-util:**      utility code used in the browser and servers
- **smc-util-node:** utility code used in servers
- **smc-hub:**       backend web and compute server code
- **smc-project:**   server code that runs in user projects
- **smc-webapp:**    frontend client code that runs in browser

### Python modules

- **smc_pyutil:**    scripts and code used on servers
- **smc_sagews:**    Sage server

## Testing

Run whole test suite:

    npm test

`min` is the minimal reporter and
other reporters are `dot`, `progress`, `nyan` or `json` - [for more see here](http://mochajs.org/)

NOTE: There is only some of smc-webapp, look into its `test` subdirectory.

NOTE: You must already be running the PostgreSQL database, setup so that
`psql` connects to it without having to type a password, before you an
run the smc-hub test suite.  See the `dev/*/` directory for relevant scripts.

### Upgrades

In a node.js module, type

    ncu

to see all packages that are out of date *not* respecting semver.  See https://www.npmjs.com/package/npm-check-updates for more about how to use ncu.

### Lint

    npm run lint

### Coverage

    npm run coverage

This generates a text and html summary in the `coverage/` sub-directory for the given modules.

NOTE: There is no working testing or coverage of smc-webapp yet.

### Start webpack watcher in development mode

    ./w

## License Headers

1. install [licenseheaders]()
2. run
   ```
   licenseheaders --dir src/ --tmpl LICENSE.tmpl -x $(find -maxdepth 3 -name node_modules -type d) -d . --additional-extensions java=.ts --owner "Sagemath, Inc." -y 2012-2020  --projname CoCalc --projurl "https//cocalc.com"
   ```


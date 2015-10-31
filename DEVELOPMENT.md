# Development Information

Source code is in the `src/` subdirectory.

## Modules:

- smc-util:      javascript utility code used in the browser and servers
- smc-util-node: node.js utility code used in servers
- smc-hub:       backend web and compute server code
- smc-project:   server code that runs in user projects
- smc_pyutil:    python scripts and code used on servers
- smc_sagews:    python Sage server
- smc-webapp:    frontend client code that runs in browser

## Testing

Run whole test suite:

    npm test

`min` is the minimal reporter and
other reporters are `dot`, `progress`, `nyan` or `json` - [for more see here](http://mochajs.org/)

NOTE: There is no working testing or coverage of smc-webapp yet.

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

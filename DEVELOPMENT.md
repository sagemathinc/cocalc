# Development Information

- Source code is in the `src/` subdirectory.
- Additional development information _**(which hasn't been updated in years!)**_ is in the `docs/` directory.

## Development

All development of CoCalc is done from within a cocalc project running on https://cocalc.com.  

See `src/README.md` to get started doing development.

## The Components of CoCalc

### Node.js modules

- **smc-util:**      utility code used in the browser and servers
- **smc-util-node:** utility code used in servers
- **smc-hub:**       backend web and compute server code
- **smc-project:**   server code that runs in user projects
- **smc-webapp:**    frontend client code that runs in browser
- See also the packages/ subdirectory.

### Python modules

- **smc_pyutil:**    scripts and code used on servers
- **smc_sagews:**    Sage server

# Development Information

Source code is in the `src/` subdirectory.

## "Supported" development environments

Nothing is fully supported yet, but this is the goal.  The directories below have
scripts to enable development in various contexts:

- src/dev/laptop -- for development on your personal laptop (or desktop) that is not public; zero concern about security. No sudo setup.  Works on Linux and OS X.

- src/dev/project -- for developing SMC inside of any SMC project; more worry about security; No sudo setup.

- src/dev/public -- for development on a single *publicly* accessible dedicated server; more concern about security.  Must have sudo, and install things system-wide.  Each project is a different linux account.

- src/dev/smc -- related to the actual live SMC deployment, which runs on many nodes, and uses haproxy and nginx.

## Issue Triage
For the most part, we use [Rust's triage system](https://github.com/rust-lang/rust/blob/master/CONTRIBUTING.md#issue-triage)

Contributors with sufficient permissions on the Rust repo can help by adding
labels to triage issues:

* Yellow, **A**-prefixed labels state which **area** of SMC the issue relates to.

* Green, **E**-prefixed labels explain the type of **experience** necessary
  to fix the issue.

* Red, **I**-prefixed labels indicate the **importance** (relevance) of the issue. The
  [I-nominated][inom] label indicates that an issue has been nominated for
  prioritizing at the next triage meeting.

* Orange, **P**-prefixed labels indicate a bug's **priority**. These labels
  are only assigned during triage meetings, and replace the [I-nominated][inom]
  label.

* The purple **meta** label denotes a list of issues collected from other categories.


* The black, **blocked** label denotes an issue blocked by another.

If you're looking for somewhere to start, check out the [E-easy][eeasy] tag.

[inom]:https://github.com/sagemathinc/smc/labels/I-nominated
[eeasy]:https://github.com/sagemathinc/smc/labels/E-easy


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

NOTE: You must be running the RethinkDB database server on localhost (with the default 28015 port) to run the test suite.  The test suite doesn't start a database server running.

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

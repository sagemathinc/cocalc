# @cocalc/backend

CoCalc code shared **across** all types of backend node.js code:

- project
- hub
- server
- next

Put code here that tends to get used by a range of node.js server packages.  Thus this is similar to @cocalc/util, but for code that is node.js only (e.g., our password hash algorithm and code for spawning subprocesses).  Also, we put code here to establish common definitions across the project, hub, next, etc., for example the basePath and the debug-based logging.

This package does **NOT** depend on @cocalc/database.  General code that involves queries to our postgreSQL database of course wouldn't be used by @cocalc/project and don't belong here.  Put them in @cocalc/server.

## Notes

- We install the uuid module here to force requests to get installed.  (Why?)

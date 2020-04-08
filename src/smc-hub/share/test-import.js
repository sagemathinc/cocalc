/*
We load a bunch of code just to force some typescript compilation,
and generally improve the chances things will work when actually
launched.  This is run during the build process as a test, so
the build will hopefully fail if things are really broken.

Also, running this module populates ~/.ts-node-cache, which improves
server startup time significantly -- a few seconds instead of a
few **minutes**, since typescript is quite slow.
*/

console.log("Doing a test import of code...");
require("ts-node").register({
  cacheDirectory: process.env.HOME + "/.ts-node-cache",
});
require("node-cjsx").transform();
require("./server");
require("smc-webapp/r_misc");
require("smc-webapp/app-framework");
require("react-dom/server");
console.log("Test import done; now killing");
process.exit(0);

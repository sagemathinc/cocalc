/*
This loads code to generally improve the chances things will work when actually
launched.  This is run during the build process as a test.
Also, running this module populates ~/.ts-node-cache, which improves
server startup time significantly -- a few seconds instead of a
few **minutes**, since typescript is quite slow.
*/

require("coffeescript/register");
require("./hub.coffee");

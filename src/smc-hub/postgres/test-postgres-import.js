require("coffeescript/register");
require("ts-node").register({
  cacheDirectory: process.env.HOME + "/.ts-node-cache",
});
require("../postgres.coffee");

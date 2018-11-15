require("coffeescript/register");
require("ts-node").register({ project: `${__dirname}/../tsconfig.json` });

exports.synctable = require("./synctable").synctable;

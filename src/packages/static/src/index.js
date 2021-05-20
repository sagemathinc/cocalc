// Return the absolute path to the built static files, so they can be served
// up by some static webserver.

const { resolve, join } = require("path");

exports.path = resolve(join(__dirname, "..", "dist"));

/*
This is like C's #define for the source code. It is particularly useful in the
source code of CoCalc's webapp, such that it knows about its version and where
mathjax is. The version & date is shown in the hover-title in the footer (year).
If any of these are not used, then they get removed.  They are textually
substituted in when the key identifier on the left is used, hence the
JSON.stringify of all of them.
*/

const webpack = require("webpack");

module.exports = function (registerPlugin, constants) {
  const opts = {};
  for (const key in constants) {
    opts[key] = JSON.stringify(constants[key]);
  }
  registerPlugin(
    "DefinePlugin -- define frontend constants -- versions, modes, dates, etc.",
    new webpack.DefinePlugin(opts)
  );
};

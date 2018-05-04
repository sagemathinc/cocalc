/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Convert Mediawiki file to hidden HTML file, which gets displayed in an iframe with
src pointed to this file (via raw server).
*/

const misc = require("smc-util/misc");

const { required, defaults } = misc;

const { aux_file } = require("../code-editor/util");
const { webapp_client } = require("smc-webapp/webapp_client");

export function convert(opts) {
  opts = defaults(opts, {
    path: required,
    project_id: required,
    time: undefined,
    cb: required
  });
  const x = misc.path_split(opts.path);
  const outfile = aux_file(opts.path, "html");
  return webapp_client.exec({
    command: "pandoc",
    args: [
      "--toc",
      "-f",
      "mediawiki",
      "-t",
      "html5",
      "--highlight-style",
      "pygments",
      opts.path,
      "-o",
      outfile
    ],
    project_id: opts.project_id,
    err_on_exit: true,
    aggregate: opts.time,
    cb(err) {
      if (err) {
        return opts.cb(err);
      } else {
        return opts.cb(undefined, outfile);
      }
    }
  });
}

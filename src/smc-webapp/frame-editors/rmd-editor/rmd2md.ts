/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Convert R Markdown file to hidden Markdown file, then read.
*/

const async = require("async");

const misc = require("smc-util/misc");

const { required, defaults } = misc;

const { aux_file } = require("../code-editor/util");
const { webapp_client } = require("smc-webapp/webapp_client");

export function convert(opts): void {
  opts = defaults(opts, {
    path: required,
    project_id: required,
    time: undefined,
    cb: required
  }); // cb(err, 'markdown string with R parts processed...')
  const x = misc.path_split(opts.path);
  const locals = {
    infile: x.tail,
    outfile: aux_file(x.tail, "md"),
    content: undefined
  };
  const args = [
    "-e",
    `library(knitr);knit('${locals.infile}','${locals.outfile}',quiet=TRUE)`
  ];
  async.series(
    [
      cb =>
        webapp_client.exec({
          allow_post: false, // definitely could take a long time to fully run all the R stuff...
          timeout: 60,
          command: "Rscript",
          args,
          project_id: opts.project_id,
          path: x.head,
          err_on_exit: true,
          aggregate: opts.time,
          cb(err, output) {
            if (err && (output != null ? output.stderr : undefined)) {
              err = output.stderr;
            }
            return cb(err);
          }
        }),
      cb =>
        webapp_client.read_text_file_from_project({
          project_id: opts.project_id,
          path: aux_file(opts.path, "md"),
          cb(err, mesg) {
            locals.content = mesg != null ? mesg.content : undefined;
            return cb(err);
          }
        })
    ],
    err => opts.cb(err, locals.content)
  );
}

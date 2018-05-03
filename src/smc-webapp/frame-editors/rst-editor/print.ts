/*
Print Rst content
*/

const { required, defaults } = require("smc-util/misc");
const { aux_file } = require("../code-editor/util");
const { print_html } = require("../html-editor/print");

export function print_rst(opts): string {
  opts = defaults(opts, {
    project_id: required,
    path: required
  });

  const path = aux_file(opts.path, "html");
  return print_html({
    src: `${window.app_base_url}/${opts.project_id}/raw/${path}`
  });
}

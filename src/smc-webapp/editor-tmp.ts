/*
 * decaffeinate suggestions:
 * DS103: Rewrite code to no longer use __guard__
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

const misc = require("smc-util/misc");
const { file_associations } = require("./file-associations");

// Given a text file (defined by content), try to guess
// what the extension should be.
const guess_file_extension_type = function(content) {
  content = $.trim(content);
  const i = content.indexOf("\n");
  const first_line = content.slice(0, i).toLowerCase();
  if (first_line.slice(0, 2) === "#!") {
    // A script.  What kind?
    if (first_line.indexOf("python") !== -1) {
      return "py";
    }
    if (first_line.indexOf("bash") !== -1 || first_line.indexOf("sh") !== -1) {
      return "sh";
    }
  }
  if (first_line.indexOf("html") !== -1) {
    return "html";
  }
  if (first_line.indexOf("/*") !== -1 || first_line.indexOf("//") !== -1) {
    // kind of a stretch
    return "c++";
  }
  return undefined;
};

export function file_options(filename, content) {
  // content may be undefined
  let x;
  let ext = __guard__(misc.filename_extension_notilde(filename), x1 =>
    x1.toLowerCase()
  );
  if (ext == null && content != null) {
    // no recognized extension, but have contents
    ext = guess_file_extension_type(content);
  }
  if (ext === "") {
    x = file_associations[`noext-${misc.path_split(filename).tail}`];
  } else {
    x = file_associations[ext];
  }
  if (x == null) {
    x = file_associations[""];
    // Don't use the icon for this fallback, to give the icon selection below a chance to work;
    // we do this so new react editors work.  All this code will go away someday.
    delete x.icon;
  }
  if (x.icon == null) {
    // Use the new react editor icons first, if they exist...
    const icon = require("./project_file").icon(ext);
    if (icon != null) {
      x.icon = "fa-" + icon;
    } else {
      x.icon = "fa-file-code-o";
    }
  }
  return x;
}

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}

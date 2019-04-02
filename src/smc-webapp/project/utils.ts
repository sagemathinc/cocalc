const { to_iso_path } = require("smc-util/misc");
import { unreachable, capitalize } from "smc-util/misc2";
import { generate as heroku } from "project-name-generator";
const superb = require("superb");
const catNames = require("cat-names");
const dogNames = require("dog-names");

export type RandomFilename = "iso" | "heroku" | "pet";

export function random_filename(
  ext?: string,
  existing_filenames?: { [name: string]: boolean },
  fullname: boolean = false,
  type: RandomFilename = "heroku"
): string {
  const avoid = existing_filenames || {};
  while (true) {
    const new_name = _random_filename(ext, fullname, type);
    if (!avoid[new_name]) return new_name;
  }
}

function _random_filename(
  ext?: string,
  fullname: boolean = false,
  type: RandomFilename = "heroku"
): string {
  const effective_ext = ext != null ? ext.toLowerCase() : "";
  const tokens = filename_tokens(type);
  if (tokens == null) {
    // it's actually impossible that we reach that
    return "problem_generating_random_filename";
  }
  switch (effective_ext) {
    case "java": // CamelCase!
      return `${tokens.map(capitalize).join("")}.java`;
    default:
      // e.g. for python, join using "_"
      const fill = filename_filler(effective_ext);
      return tokens.join(fill) + (fullname && ext != null ? `.${ext}` : "");
  }
}

// plain tokens to build the filename
// should be ascii letters and numbers only, i.e. nothing fancy, no spaces, dashes, etc.
function filename_tokens(type: RandomFilename): string[] | void {
  switch (type) {
    case "iso":
      return to_iso_path(new Date()).split("-");
    case "pet":
      const n = Math.random() > 0.5 ? catNames.random() : dogNames.allRandom();
      const p = superb.random();
      const x = Math.round(8999 * Math.random() + 1000);
      return [p, n.toLowerCase(), x];
    case "heroku":
      return heroku({ number: true }).raw;
    default:
      return unreachable(type);
  }
}

function filename_filler(effective_ext: string): string {
  switch (effective_ext) {
    case "py":
    case "sage":
      return "_";
    default:
      return "-";
  }
}

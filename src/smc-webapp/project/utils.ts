const { to_iso_path } = require("smc-util/misc");
import { unreachable } from "smc-util/misc2";
import { generate as heroku } from "project-name-generator";
const superb = require("superb");
const catNames = require("cat-names");
const dogNames = require("dog-names");

export type RandomFilename = "iso" | "heroku" | "pet";

// TODO
// .java: capitalize tokens, and join with an empty string to CamelCase.java

export function random_filename(
  ext?: string,
  fullname: boolean = false,
  type: RandomFilename = "pet"
): string {
  const tokens: string[] = (function() {
    switch (type) {
      case "iso":
        return to_iso_path(new Date()).split("-");
      case "pet":
        const n =
          Math.random() > 0.5 ? catNames.random() : dogNames.allRandom();
        const p = superb.random();
        const x = Math.round(8999 * Math.random() + 1000);
        return [p, n.toLowerCase(), x];
      case "heroku":
        return heroku({ number: true }).raw;
      default:
        return unreachable(type);
    }
  })();
  // e.g. for python, join using "_"
  const fill = (function() {
    switch (ext != null ? ext.toLowerCase() : "") {
      case "py":
      case "sage":
        return "_";
      default:
        return "-";
    }
  })();
  return tokens.join(fill) + (fullname && ext != null ? `.${ext}` : "");
}

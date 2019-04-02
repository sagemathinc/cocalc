const { to_iso_path } = require("smc-util/misc");
import { unreachable, capitalize } from "smc-util/misc2";
import { generate as heroku } from "project-name-generator";
const superb = require("superb");
const catNames = require("cat-names");
const dogNames = require("dog-names");

export type RandomFilenameTypes =
  | "iso"
  | "heroku"
  | "ymd_heroku"
  | "pet"
  | "ymd_pet";

export const RandomFilenameFamilies = Object.freeze<
  Readonly<{ [name in RandomFilenameTypes]: string }>
>({
  iso: "Current time (UTC)",
  heroku: "Heroku-like",
  ymd_heroku: "Heroku-like (prefix today)",
  pet: "Pet names",
  ymd_pet: "Pre names (prefix today)"
});

export class RandomFilenames {
  static default_family = "heroku" as RandomFilenameTypes;

  private ext?: string;
  private effective_ext: string;
  private fullname: boolean;
  private type: RandomFilenameTypes;

  constructor(ext?, fullname = false, type = RandomFilenames.default_family) {
    this.ext = ext;
    this.effective_ext = ext != null ? ext.toLowerCase() : "";
    this.fullname = fullname;
    this.type = type;
  }

  public gen(avoid?: { [name: string]: boolean }) {
    if (avoid == null) {
      return this.random_filename();
    } else {
      while (true) {
        const new_name = this.random_filename();
        if (!avoid[new_name]) return new_name;
      }
    }
  }

  private random_filename(): string {
    const tokens = this.tokens();
    if (tokens == null) {
      // it's actually impossible that we reach that
      return "problem_generating_random_filename";
    }
    if (["ymd_heroku", "ymd_pet"].includes(this.type)) {
      tokens.unshift(
        new Date()
          .toISOString()
          .slice(0, 10)
          .split("-")
          .join("")
      );
    }
    switch (this.effective_ext) {
      case "java": // CamelCase!
        return `${tokens.map(capitalize).join("")}.java`;
      default:
        // e.g. for python, join using "_"
        const fill = this.filler();
        return (
          tokens.join(fill) +
          (this.fullname && this.ext != null ? `.${this.ext}` : "")
        );
    }
  }
  // plain tokens to build the filename
  // should be ascii letters and numbers only, i.e. nothing fancy, no spaces, dashes, etc.
  private tokens(): string[] | void {
    switch (this.type) {
      case "iso":
        return to_iso_path(new Date()).split("-");

      case "pet":
      case "ymd_pet":
        const n =
          Math.random() > 0.5 ? catNames.random() : dogNames.allRandom();
        const p = superb.random();
        return [p, n.toLowerCase()];

      case "ymd_heroku":
      case "heroku":
        return heroku({ number: false }).raw;

      default:
        return unreachable(this.type);
    }
  }

  private filler(): string {
    switch (this.effective_ext) {
      case "py":
      case "sage":
        return "_";
      default:
        return "-";
    }
  }
}

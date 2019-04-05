const { to_iso_path } = require("smc-util/misc");
import { unreachable, capitalize } from "smc-util/misc2";
import { generate as heroku } from "project-name-generator";
const superb = require("superb");
const catNames = require("cat-names");
const dogNames = require("dog-names");
const { file_options } = require("../editor");

export type RandomFilenameTypes =
  | "iso"
  | "heroku"
  | "pet"
  | "ymd_heroku"
  | "ymd_pet"
  | "semantic"
  | "ymd_semantic";

export const RandomFilenameFamilies = Object.freeze<
  Readonly<{ [name in RandomFilenameTypes]: string }>
>({
  iso: "Current time",
  heroku: "Heroku-like",
  ymd_heroku: "Heroku-like (prefix today)",
  pet: "Pet names",
  ymd_pet: "Pet names (prefix today)",
  semantic: "Sematic",
  ymd_semantic: "Sematic (prefix today) "
});

export class RandomFilenames {
  static default_family = "ymd_semantic" as RandomFilenameTypes;

  private ext?: string;
  private effective_ext: string;
  private fullname: boolean;
  private type: RandomFilenameTypes;
  private start: number = 0;

  constructor(ext?, fullname = false) {
    this.set_ext(ext);
    this.fullname = fullname;
  }

  public set_ext(ext: string) {
    if (this.ext != ext) {
      this.start = 0;
    }
    this.ext = ext;
    this.effective_ext = ext != null ? ext.toLowerCase() : "";
  }

  // generate a new filename, by optionally avoiding the keys in the dictionary
  public gen(
    type = RandomFilenames.default_family,
    avoid?: { [name: string]: boolean }
  ) {
    this.type = type;
    if (avoid == null) {
      return this.random_filename(this.fullname);
    } else {
      // incremental numbering starting at 1, natural for humans
      this.start += 1;
      // this is a sanitized while(true)
      for (let i = this.start; i < this.start + 1000; i++) {
        // to check if file already exists, we need the fullname!
        const new_name = this.random_filename(true, i);
        if (!avoid[new_name]) {
          this.start = i;
          // but if we do not need the fullname, cut it off
          if (!this.fullname && this.ext != null) {
            return new_name.slice(0, -(this.ext.length + 1));
          } else {
            return new_name;
          }
        }
      }
    }
  }

  private random_filename(fullname: boolean, cnt?: number): string {
    const tokens = this.tokens();
    if (tokens == null) {
      // it's actually impossible that we reach that
      return ["error", "generating", "random", "filename"].join(this.filler());
    }
    // if we have a counter, append the number
    if (cnt != null && this.type.endsWith("semantic")) {
      tokens.push(`${cnt}`);
    }
    // in some cases, prefix with the current day
    if (this.type.startsWith("ymd_")) {
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
        let fn = tokens.join(this.filler());
        if (fullname && this.ext != null) {
          fn += `.${this.ext}`;
        }
        return fn;
    }
  }

  private semantic(): string[] {
    const tokens: string[] = ((): string[] => {
      switch (this.effective_ext) {
        case "ipynb":
          return ["notebook"];
        case "sagews":
          return ["worksheet"];
        case "md":
          return ["notes"];
        case "tex":
        case "rmd":
          return ["document"];
        case "sage":
          return ["sage", "code"];
        case "py":
          return ["python", "code"];
        default:
          const info: any = file_options(`foo.${this.effective_ext}`);
          // the "Spec" for file associations makes sure that "name" != null
          return info.name.toLowerCase().split(" ");
      }
    })();

    return tokens;
  }

  // plain tokens to build the filename
  // should be ascii letters and numbers only, i.e. nothing fancy, no spaces, dashes, etc.
  private tokens(): string[] | void {
    switch (this.type) {
      case "iso":
        // local time of user
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

      case "semantic":
      case "ymd_semantic":
        return this.semantic();

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

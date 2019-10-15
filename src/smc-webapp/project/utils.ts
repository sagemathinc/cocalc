const { to_iso_path } = require("smc-util/misc");
import {
  unreachable,
  capitalize,
  uuid,
  separate_file_extension
} from "smc-util/misc2";
import { generate as heroku } from "project-name-generator";
const superb = require("superb");
const catNames = require("cat-names");
const dogNames = require("dog-names");
const { file_options } = require("../editor-tmp");
import { DEFAULT_NEW_FILENAMES } from "smc-util/db-schema";

export type NewFilenameTypes =
  | "iso"
  | "heroku"
  | "pet"
  | "ymd_heroku"
  | "ymd_pet"
  | "semantic"
  | "ymd_semantic";

export const NewFilenameFamilies = Object.freeze<
  Readonly<{ [name in NewFilenameTypes]: string }>
>({
  iso: "Current time",
  heroku: "Heroku-like",
  ymd_heroku: "Heroku-like (prefix today)",
  pet: "Pet names",
  ymd_pet: "Pet names (prefix today)",
  semantic: "Sematic",
  ymd_semantic: "Sematic (prefix today) "
});

export class NewFilenames {
  // TODO iso is the "old way". Change it to "semantic" after a week or two…
  static default_family = DEFAULT_NEW_FILENAMES as NewFilenameTypes;

  private ext?: string;
  private effective_ext?: string;
  private fullname: boolean;
  private type: NewFilenameTypes;
  private start: number = 0;

  constructor(ext?, fullname = false) {
    this.set_ext(ext);
    this.fullname = fullname;
  }

  public set_ext(ext: string): void {
    if (this.ext != ext || ext == null) {
      this.start = 0;
    }
    this.ext = ext;
    this.effective_ext = ext != null ? ext.toLowerCase() : undefined;
  }

  // generate a new filename, by optionally avoiding the keys in the dictionary
  public gen(
    type?: NewFilenameTypes,
    avoid?: { [name: string]: boolean }
  ): string {
    type = type != null ? type : NewFilenames.default_family;
    // reset the enumeration if type changes
    if (this.type != type) this.start = 0;
    this.type = type;
    if (avoid == null) {
      return this.new_filename(this.fullname);
    } else {
      // ignore all extensions in avoid "set", if we do not know the file extension
      if (this.effective_ext == null) {
        const noexts = Object.keys(avoid).map(
          x => separate_file_extension(x).name
        );
        avoid = Object.assign({}, ...noexts.map(x => ({ [x]: true })));
      }
      avoid = avoid || {}; // satisfy TS
      // incremental numbering starts at 1, natural for humans
      this.start += 1;
      // this is a sanitized while(true)
      for (let i = this.start; i < this.start + 1000; i++) {
        // to check if file already exists, we need the fullname!
        const new_name = this.new_filename(true, i);
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
      // theoretically we could end here. ugly UUID for the rescue.
      const new_name = this.new_filename(false);
      const rnd = uuid().split("-");
      const name = [new_name, ...rnd].join(this.filler());
      return `${name}.${this.ext}`;
    }
  }

  private new_filename(fullname: boolean, cnt?: number): string {
    const tokens = this.tokens();
    if (tokens == null) {
      // it's actually impossible that we reach that
      return ["error", "generating", "new", "filename"].join(this.filler());
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
    switch (this.effective_ext) {
      case "ipynb":
        return ["notebook"];
      case "sagews":
        return ["worksheet"];
      case "md":
        return ["notes"];
      case "tex":
      case "rmd":
      case "rnw":
      case "rtex":
        return ["document"];
      case "sage":
        return ["sage", "code"];
      case "py":
        return ["python", "code"];
      default:
        const info = file_options(`foo.${this.effective_ext}`);
        // the "Spec" for file associations makes sure that "name" != null
        // but for unkown files "name" == "" → fallback "file"
        const name = info.name;
        return name === "" ? ["file"] : name.toLowerCase().split(" ");
    }
  }

  // some superb words contain characters we want to avoid
  private get_superb(): string {
    while (true) {
      let ret = superb.random();
      if (ret.match(/^[a-zA-Z0-9]+$/)) return ret;
    }
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
        const p = this.get_superb();
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

const sha1 = require("sha1");

export function editor_id(project_id: string, path: string): string {
  return `cocalc-editor-${sha1(project_id + path)}`;
}

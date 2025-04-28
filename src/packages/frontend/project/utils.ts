/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import * as catNames from "cat-names";
import * as dogNames from "dog-names";
import * as os_path from "path";
import { generate as heroku } from "project-name-generator";
import * as superb from "superb";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { BASE_URL } from "@cocalc/frontend/misc";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { DEFAULT_NEW_FILENAMES } from "@cocalc/util/db-schema";
import { NewFilenameTypes } from "@cocalc/util/db-schema/defaults";
import {
  capitalize,
  encode_path,
  path_split,
  separate_file_extension,
  sha1,
  startswith,
  to_iso_path,
  unreachable,
  uuid,
} from "@cocalc/util/misc";
import { fileURL } from "@cocalc/frontend/lib/cocalc-urls";

export function randomPetName() {
  return Math.random() > 0.5 ? catNames.random() : dogNames.allRandom();
}

export const NewFilenameFamilies: { [name in NewFilenameTypes]: string } = {
  iso: "Current time",
  heroku: "Heroku-like",
  ymd_heroku: "Heroku-like (prefix today)",
  pet: "Pet names",
  ymd_pet: "Pet names (prefix today)",
  semantic: "Semantic",
  ymd_semantic: "Semantic (prefix today) ",
} as const;

// check that the given argument is of type NewFilenameTypes
function isNewFilenameType(x: unknown): x is NewFilenameTypes {
  return typeof x === "string" && NewFilenameFamilies[x] != null;
}

export class NewFilenames {
  private ext?: string;
  private effective_ext?: string;
  private fullname: boolean;
  private type: NewFilenameTypes;
  private start: number = 0;

  constructor(ext?, fullname = false) {
    this.set_ext(ext);
    this.fullname = fullname;
  }

  public set_ext(ext?: string): void {
    if (this.ext != ext || ext == null) {
      this.start = 0;
    }
    this.ext = ext;
    this.effective_ext = ext != null ? ext.toLowerCase() : undefined;
  }

  private sanitize_type(type: unknown): NewFilenameTypes {
    if (type == null) return DEFAULT_NEW_FILENAMES;
    if (isNewFilenameType(type)) {
      return type;
    } else {
      console.warn(`unknown new filename family type ${type}`);
      return DEFAULT_NEW_FILENAMES;
    }
  }

  // generate a new filename, by optionally avoiding the keys in the dictionary
  public gen(
    type?: NewFilenameTypes,
    avoid?: { [name: string]: boolean },
  ): string {
    type = this.sanitize_type(type);
    // reset the enumeration if type changes
    if (this.type != type) this.start = 0;
    this.type = type;
    if (avoid == null) {
      return this.new_filename(this.fullname);
    } else {
      // ignore all extensions in avoid "set", if we do not know the file extension
      if (this.effective_ext == null) {
        const noexts = Object.keys(avoid).map(
          (x) => separate_file_extension(x).name,
        );
        avoid = Object.assign({}, ...noexts.map((x) => ({ [x]: true })));
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
      if (this.ext === "") {
        return name;
      } else {
        return `${name}.${this.ext}`;
      }
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
      const ts = new Date().toISOString().slice(0, 10);
      tokens.unshift(ts.replace(/-/g, this.filler()));
    }
    switch (this.effective_ext) {
      case "java": // CamelCase!
        return `${tokens.map(capitalize).join("")}.java`;
      default:
        // e.g. for python, join using "_"
        let fn = tokens.join(this.filler());
        if (fullname && this.ext != null && this.ext !== "") {
          fn += this.ext === "/" ? "/" : `.${this.ext}`;
        }
        return fn;
    }
  }

  private semantic(): string[] {
    switch (this.effective_ext) {
      case "/":
        return ["folder"];
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
      case "x11":
        return ["desktop"];
      case "zip":
        return ["archive"];
      default:
        const info = file_options(`foo.${this.effective_ext}`);
        // the "Spec" for file associations makes sure that "name" != null
        // but for unkown files "name" == "" → fallback "file"
        const name = info.name;
        return name === ""
          ? ["file"]
          : name.replace(/\//g, "_").toLowerCase().split(" ");
    }
  }

  // some superb words contain characters we want to avoid
  private get_superb(): string {
    while (true) {
      const ret = superb.random();
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
        const n = randomPetName();
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

  private filler(): "-" | "_" {
    switch (this.effective_ext) {
      case "py":
      case "sage":
        return "_";
      default:
        return "-";
    }
  }
}

export function editor_id(project_id: string, path: string): string {
  return `cocalc-editor-${sha1(project_id + path)}`;
}

// Normalize path as in node, except '' is the home dir, not '.'.
// Also, if ~/ is somewhere in the path, start over at home.
export function normalize(path: string): string {
  while (true) {
    const pattern = "/~/";
    const i = path.indexOf(pattern);
    if (i == -1) {
      break;
    }
    path = path.slice(i + pattern.length);
  }
  if (path.startsWith("~/")) {
    path = path.slice(2);
  }

  path = os_path.normalize(path);
  if (path === ".") {
    return "";
  } else {
    return path;
  }
}

// test, if the given file exists and has nonzero size
export async function file_nonzero_size(
  project_id: string,
  path: string,
): Promise<boolean> {
  const f = path_split(path);
  try {
    await webapp_client.exec({
      project_id,
      command: "test",
      args: ["-s", f.tail] /* "FILE exists and has a size greater than zero" */,
      path: f.head,
      err_on_exit: true,
    });
  } catch (err) {
    return false;
  }
  return true;
}

// returns the full URL path to the file (not the "raw" server)
export function url_fullpath(project_id: string, path: string): string {
  return os_path.join(
    BASE_URL,
    "projects",
    project_id,
    "files",
    `${encode_path(path)}`,
  );
}

// returns the URL for the file at the given path
export function url_href(
  project_id: string,
  path: string,
  compute_server_id?: number,
): string {
  return fileURL({ project_id, path, compute_server_id });
}

// returns the download URL for a file at a given path
export function download_href(
  project_id: string,
  path: string,
  compute_server_id?: number,
): string {
  const u = url_href(project_id, path, compute_server_id);
  if (!compute_server_id) {
    return `${u}?download`;
  }
  // there's already a ?id=[number], so use &.
  return `${u}&download`;
}

export function in_snapshot_path(path: string): boolean {
  return startswith(path, ".snapshots/") || path.indexOf("/.snapshots/") != -1;
}

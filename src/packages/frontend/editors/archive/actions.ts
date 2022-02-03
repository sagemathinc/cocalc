/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { webapp_client } from "../../webapp-client";
import {
  filename_extension,
  filename_extension_notilde,
  keys,
  path_split,
  split,
} from "@cocalc/util/misc";
import { Actions, redux_name } from "../../app-framework";
import { register_file_editor } from "../../project-file";

import { Archive } from "./component";
import { COMMANDS, DOUBLE_EXT } from "./misc";

function init_redux(path: string, redux, project_id: string): string {
  const name = redux_name(project_id, path);
  if (redux.getActions(name) != null) {
    return name;
  }
  redux.createStore(name);
  const actions = redux.createActions(name, ArchiveActions);
  actions.setArchiveContents(project_id, path);
  return name;
}

function remove_redux(path: string, redux, project_id: string): string {
  const name = redux_name(project_id, path);
  redux.removeActions(name);
  redux.removeStore(name);
  return name;
}

interface State {
  contents?: string;
  type?: string;
  loading?: boolean;
  command?: string;
  error?: string;
  extract_output?: string;
}

export class ArchiveActions extends Actions<State> {
  parse_file_type(file_info: string): string | undefined {
    if (file_info.indexOf("Zip archive data") !== -1) {
      return "zip";
    } else if (file_info.indexOf("tar archive") !== -1) {
      return "tar";
    } else if (file_info.indexOf("gzip compressed data") !== -1) {
      return "gz";
    } else if (file_info.indexOf("bzip2 compressed data") !== -1) {
      return "bzip2";
    } else if (file_info.indexOf("lzip compressed data") !== -1) {
      return "lzip";
    } else if (file_info.indexOf("XZ compressed data") !== -1) {
      return "xz";
    }
    return undefined;
  }

  setUnsupported(ext: string | undefined): void {
    this.setState({
      error: "unsupported",
      contents: "",
      type: ext,
    });
  }

  /**
   * Extract the extension, and check if there is a tilde.
   */
  private extractExtension(pathReal: string): string | null {
    const path = pathReal.toLowerCase(); // convert to lowercase for case-insensitive matching
    const ext0 = filename_extension_notilde(path);
    const ext = filename_extension(path);
    if (ext0 !== ext) {
      this.setState({
        error: "Rename the archive file to not end in a tilde.",
      });
      return null;
    }
    // there are "double extension" with a dot, like "tar.bz2"
    for (const ext of DOUBLE_EXT) {
      if (path.endsWith(`.${ext}`)) {
        return ext;
      }
    }
    return ext;
  }

  async setArchiveContents(project_id: string, path: string): Promise<void> {
    const ext = this.extractExtension(path);
    if (ext === null) return;

    if (COMMANDS[ext]?.list == null) {
      this.setUnsupported(ext);
      return;
    }

    const { command, args } = COMMANDS[ext].list;

    try {
      const output = await webapp_client.exec({
        project_id,
        command,
        args: args.concat([path]),
        err_on_exit: true,
      });
      this.setState({
        error: undefined,
        contents: output?.stdout,
        type: ext,
      });
    } catch (err) {
      this.setState({
        error: err?.toString(),
        contents: undefined,
        type: ext,
      });
    }
  }

  async extractArchiveFiles(
    project_id: string,
    path: string,
    type: string | undefined,
    contents: string | undefined
  ): Promise<void> {
    if (type == null || COMMANDS[type]?.extract == null) {
      this.setUnsupported(type);
      return;
    }
    let post_args;
    let { command, args } = COMMANDS[type].extract;
    const path_parts = path_split(path);
    let extra_args: string[] = (post_args = []);
    let output: any = undefined;
    let base;
    let error: string | undefined = undefined;
    this.setState({ loading: true });
    try {
      if (contents == null) {
        throw Error("Archive not loaded yet");
      } else if (type === "zip") {
        // special case for zip files: if heuristically it looks like not everything is contained
        // in a subdirectory with name the zip file, then create that subdirectory.
        base = path_parts.tail.slice(0, path_parts.tail.length - 4);
        if (contents.indexOf(base + "/") === -1) {
          extra_args = ["-d", base];
        }
      } else if (["tar", "tar.gz", "tar.bz2"].includes(type)) {
        // special case for tar files: if heuristically it looks like not everything is contained
        // in a subdirectory with name the tar file, then create that subdirectory.
        const i = path_parts.tail.lastIndexOf(".t"); // hopefully that's good enough.
        base = path_parts.tail.slice(0, i);
        if (contents.indexOf(base + "/") === -1) {
          post_args = ["-C", base];
          await webapp_client.exec({
            project_id,
            path: path_parts.head,
            command: "mkdir",
            args: ["-p", base],
            error_on_exit: true,
          });
        }
      }
      args = args
        .concat(extra_args != null ? extra_args : [])
        .concat([path_parts.tail])
        .concat(post_args);
      const args_str = args
        .map((x) => (x.indexOf(" ") !== -1 ? `'${x}'` : x))
        .join(" ");
      const cmd = `cd \"${path_parts.head}\" ; ${command} ${args_str}`; // ONLY for info purposes -- not actually run!
      this.setState({ command: cmd });
      output = await webapp_client.exec({
        project_id,
        path: path_parts.head,
        command,
        args,
        err_on_exit: true,
        timeout: 120,
      });
    } catch (err) {
      error = err.toString();
    }

    this.setState({
      error,
      extract_output: output?.stdout,
      loading: false,
    });
  }
}

// TODO: change ext below to use keys(COMMANDS).  We don't now, since there are a
// ton of extensions that should open in the archive editor, but aren't implemented
// yet and we don't want to open those in codemirror -- see https://github.com/sagemathinc/cocalc/issues/1720
// NOTE: One you implement one of these (so it is in commands), be
// sure to delete it from the list below.
const TODO_TYPES = split("z lz lzma tbz tb2 taz tz tlz txz");
register_file_editor({
  ext: keys(COMMANDS).concat(TODO_TYPES),
  icon: "file-archive",
  init: init_redux,
  remove: remove_redux,
  component: Archive,
});

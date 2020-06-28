import { webapp_client } from "../../webapp-client";
import {
  filename_extension,
  filename_extension_notilde,
  keys,
  path_split,
  split,
} from "smc-util/misc";
import { Actions, redux_name } from "../../app-framework";
import { register_file_editor } from "../../project-file";

import { Archive } from "./component";

const COMMANDS: {
  [type: string]: {
    list: { command: string; args: string[] };
    extract: { command: string; args: string[] };
  };
} = {
  zip: {
    list: {
      command: "unzip",
      args: ["-l"],
    },
    extract: {
      command: "unzip",
      args: ["-B"],
    },
  },
  tar: {
    list: {
      command: "tar",
      args: ["-tf"],
    },
    extract: {
      command: "tar",
      args: ["-xvf"],
    },
  },
  tgz: {
    list: {
      command: "tar",
      args: ["-tzf"],
    },
    extract: {
      command: "tar",
      args: ["-xvzf"],
    },
  },
  gz: {
    list: {
      command: "gzip",
      args: ["-l"],
    },
    extract: {
      command: "gunzip",
      args: ["-vf"],
    },
  },
  bzip2: {
    list: {
      command: "ls",
      args: ["-l"],
    },
    extract: {
      command: "bunzip2",
      args: ["-vf"],
    },
  },
  lzip: {
    list: {
      command: "ls",
      args: ["-l"],
    },
    extract: {
      command: "lzip",
      args: ["-vfd"],
    },
  },
  xz: {
    list: {
      command: "xz",
      args: ["-l"],
    },
    extract: {
      command: "xz",
      args: ["-vfd"],
    },
  },
};

COMMANDS.bz2 = COMMANDS.bzip2;

function init_redux(
  path: string,
  redux,
  project_id: string
): string  {
  const name = redux_name(project_id, path);
  if (redux.getActions(name) != null) {
    return name;
  }
  redux.createStore(name);
  const actions = redux.createActions(name, ArchiveActions);
  actions.set_archive_contents(project_id, path);
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

class ArchiveActions extends Actions<State> {
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

  set_unsupported(ext: string): void {
    this.setState({
      error: "unsupported",
      contents: "",
      type: ext,
    });
  }

  async set_archive_contents(project_id: string, path: string): Promise<void> {
    const ext0 = filename_extension_notilde(path)?.toLowerCase();
    const ext = filename_extension(path)?.toLowerCase();
    if (ext0 !== ext) {
      this.setState({
        error: "Rename the archive file to not end in a tilde.",
      });
      return;
    }

    if (COMMANDS[ext]?.list == null) {
      this.set_unsupported(ext);
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

  async extract_archive_files(
    project_id: string,
    path: string,
    type: string,
    contents: string
  ): Promise<void> {
    if (COMMANDS[type]?.extract == null) {
      this.set_unsupported(type);
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
      } else if (type === "tar") {
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
// ton of extensions that shoud open in the archive editor, but aren't implemented
// yet and we don't want to open those in codemirror -- see https://github.com/sagemathinc/cocalc/issues/1720
const TODO_TYPES = split("z lz lzma tgz tbz tbz2 tb2 taz tz tlz txz");
register_file_editor({
  ext: keys(COMMANDS).concat(TODO_TYPES),
  icon: "file-archive-o",
  init: init_redux,
  remove: remove_redux,
  component: Archive,
});

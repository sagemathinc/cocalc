/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Implement the open_file actions for opening one single file in a project.

import { callback } from "awaiting";

import { alert_message } from "@cocalc/frontend/alerts";
import { redux } from "@cocalc/frontend/app-framework";
import { local_storage } from "@cocalc/frontend/editor-local-storage";
import { dialogs } from "@cocalc/frontend/i18n";
import { getIntl } from "@cocalc/frontend/i18n/get-intl";
import Fragment, { FragmentId } from "@cocalc/frontend/misc/fragment-id";
import { remove } from "@cocalc/frontend/project-file";
import { ProjectActions } from "@cocalc/frontend/project_actions";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { retry_until_success } from "@cocalc/util/async-utils";
import {
  defaults,
  filename_extension,
  filename_extension_notilde,
  path_to_tab,
  required,
  uuid,
} from "@cocalc/util/misc";
import { SITE_NAME } from "@cocalc/util/theme";
import { ensure_project_running } from "./project-start-warning";
import { normalize } from "./utils";
import { syncdbPath as ipynbSyncdbPath } from "@cocalc/util/jupyter/names";
import { termPath } from "@cocalc/util/terminal/names";

export interface OpenFileOpts {
  path: string;
  ext?: string; // if given, use editor for this extension instead of whatever extension path has.
  line?: number; // mainly backward compat for now
  fragmentId?: FragmentId; // optional URI fragment identifier that describes position in this document to jump to when we actually open it, which could be long in the future, e.g., due to shift+click to open a background tab.  Inspiration from https://en.wikipedia.org/wiki/URI_fragment
  foreground?: boolean;
  foreground_project?: boolean;
  chat?: boolean;
  chat_width?: number;
  ignore_kiosk?: boolean;
  new_browser_window?: boolean;
  change_history?: boolean;
  // opened via an explicit click
  explicit?: boolean;
  // if specified, open the file on the specified compute server; if not given,
  // opens it on whatever compute server it is currently set to open on.
  compute_server_id?: number;
}

export async function open_file(
  actions: ProjectActions,
  opts: OpenFileOpts,
): Promise<void> {
  // console.log("open_file: ", opts);

  if (opts.path.endsWith("/")) {
    actions.open_directory(opts.path);
    return;
  }

  opts = defaults(opts, {
    path: required,
    ext: undefined,
    line: undefined,
    fragmentId: undefined,
    foreground: true,
    foreground_project: true,
    chat: undefined,
    chat_width: undefined,
    ignore_kiosk: false,
    new_browser_window: false,
    change_history: true,
    explicit: false,
    compute_server_id: undefined,
  });
  opts.path = normalize(opts.path);

  if (opts.line != null && !opts.fragmentId) {
    // backward compat
    opts.fragmentId = { line: `${opts.line}` };
  }

  const is_kiosk = () =>
    !opts.ignore_kiosk &&
    (redux.getStore("page") as any).get("fullscreen") === "kiosk";

  if (opts.new_browser_window) {
    // TODO: options other than path are ignored right now.
    // if there is no path, we open the entire project and want
    // to show the tabs – unless in kiosk mode
    const fullscreen = is_kiosk() ? "kiosk" : opts.path ? "default" : "";
    actions.open_in_new_browser_window(opts.path, fullscreen);
    return;
  }

  // ensure the project is opened -- otherwise the modal to start the project won't appear.
  redux.getActions("projects").open_project({
    project_id: actions.project_id,
    switch_to: opts.foreground_project,
  });

  const tabIsOpened = () =>
    !!actions.get_store()?.get("open_files")?.has(opts.path);
  const alreadyOpened = tabIsOpened();

  if (!alreadyOpened) {
    // Make the visible tab itself appear ASAP (just the tab at the top,
    // not the file contents), even though
    // some stuff that may await below needs to happen.
    // E.g., if the user elects not to start the project, or
    // we have to resolve a symlink instead, then we *fix*
    // that below!  This makes things fast and predictable
    // usually.
    if (!actions.open_files) return; // closed
    actions.open_files.set(opts.path, "component", {});
  }

  // intercept any requests to open files with an error when in kiosk mode
  if (is_kiosk() && !alreadyOpened) {
    alert_message({
      type: "error",
      message: `CoCalc is in Kiosk mode, so you may not open "${opts.path}".  Please try visiting ${document.location.origin} directly.`,
      timeout: 15,
    });
    return;
  }

  if (
    opts.fragmentId == null &&
    !alreadyOpened &&
    location.hash.slice(1) &&
    opts.foreground
  ) {
    // If you just opened a file and location.hash is set and in foreground, go to
    // that location.  Do NOT do this if opts.foreground not set, e.g,. when restoring
    // session, because then all background files are configured to open with that
    // fragment.
    opts.fragmentId = Fragment.decode(location.hash);
  }

  const intl = await getIntl();
  if (!tabIsOpened()) {
    return;
  }
  const what = intl.formatMessage(dialogs.project_open_file_what, {
    path: opts.path,
  });

  if (!(await ensure_project_running(actions.project_id, what))) {
    if (!actions.open_files) return; // closed
    actions.open_files.delete(opts.path);
    return;
  }
  if (!tabIsOpened()) {
    return;
  }

  try {
    // Unfortunately (it adds a roundtrip to the server), we **have** to do this
    // due to https://github.com/sagemathinc/cocalc/issues/4732 until we actually
    // genuinely implement symlink support.  Otherwise bad things happen.  Much of
    // cocalc was implemented basically assuming links don't exist; it's not easy
    // to change that!
    const realpath = await webapp_client.project_client.realpath({
      project_id: actions.project_id,
      path: opts.path,
    });
    if (!tabIsOpened()) {
      return;
    }
    if (opts.path != realpath) {
      if (!actions.open_files) return; // closed
      alert_message({
        type: "info",
        message: `Opening normalized real path "${realpath}"`,
        timeout: 10,
      });
      actions.open_files.delete(opts.path);
      opts.path = realpath;
      actions.open_files.set(opts.path, "component", {});
    }
  } catch (_) {
    // TODO: old projects will not have the new realpath api call -- can delete this try/catch at some point.
  }
  let ext = opts.ext ?? filename_extension_notilde(opts.path).toLowerCase();

  // Next get the group.
  let group: string;
  try {
    group = await get_my_group(actions.project_id);
    if (!tabIsOpened()) {
      return;
    }
  } catch (err) {
    actions.set_activity({
      id: uuid(),
      error: `opening file '${opts.path}' (error getting group) -- ${err}`,
    });
    return;
  }

  let store = actions.get_store();
  if (store == null) {
    return;
  }

  const is_public = group === "public";

  if (!is_public) {
    // Check if have capability to open this file.  Important
    // to only do this if not public, since again, if public we
    // are not even using the project (it is all client side).
    const can_open_file = await store.can_open_file_ext(ext, actions);
    if (!tabIsOpened()) {
      return;
    }
    if (!can_open_file) {
      const site_name =
        redux.getStore("customize").get("site_name") || SITE_NAME;
      alert_message({
        type: "error",
        message: `This ${site_name} project cannot open ${ext} files!`,
        timeout: 20,
      });
      // console.log(
      //   `abort project_actions::open_file due to lack of support for "${ext}" files`
      // );
      return;
    }

    // Wait for the project to start opening (only do this if not public -- public users don't
    // know anything about the state of the project).
    try {
      await callback(actions._ensure_project_is_open.bind(actions));
      if (!tabIsOpened()) {
        return;
      }
    } catch (err) {
      actions.set_activity({
        id: uuid(),
        error: `Error opening file '${opts.path}' (error ensuring project is open) -- ${err}`,
      });
      return;
    }
    if (!tabIsOpened()) {
      return;
    }
  }

  if (!is_public && (ext === "sws" || ext.slice(0, 4) === "sws~")) {
    // NOTE: This is REALLY REALLY ANCIENT support for a 20-year old format...
    await open_sagenb_worksheet({ ...opts, project_id: actions.project_id });
    return;
  }

  if (!is_public) {
    get_side_chat_state(actions.project_id, opts);
  }

  store = actions.get_store(); // because async stuff happened above.
  if (store == undefined) {
    return;
  }

  // Only generate the editor component if we don't have it already
  // Also regenerate if view type (public/not-public) changes.
  // (TODO: get rid of that change code since public is deprecated)
  const open_files = store.get("open_files");
  if (open_files == null || actions.open_files == null) {
    // project is closing
    return;
  }
  const file_info = open_files.getIn([opts.path, "component"], {
    is_public: false,
  }) as any;
  if (!alreadyOpened || file_info.is_public !== is_public) {
    const was_public = file_info.is_public;

    if (was_public != null && was_public !== is_public) {
      actions.open_files.delete(opts.path);
      remove(opts.path, redux, actions.project_id, was_public);
    }

    // Add it to open files
    actions.open_files.set(opts.path, "ext", ext);
    actions.open_files.set(opts.path, "component", { is_public });
    actions.open_files.set(opts.path, "chat_width", opts.chat_width);
    if (opts.chat) {
      actions.open_chat({ path: opts.path });
    }

    redux.getActions("page").save_session();
  }

  actions.open_files.set(opts.path, "fragmentId", opts.fragmentId ?? "");

  if ((opts.compute_server_id != null || opts.explicit) && !alreadyOpened) {
    let path = opts.path;
    path = canonicalPath(path);
    try {
      await actions.setComputeServerIdForFile({
        path,
        compute_server_id: opts.compute_server_id,
        confirm: true,
      });
    } catch (err) {
      actions.open_files.delete(opts.path);
      alert_message({
        type: "error",
        message: `${err}`,
        timeout: 20,
      });
      return;
    }
  }
  if (!tabIsOpened()) {
    return;
  }

  if (opts.foreground) {
    actions.foreground_project(opts.change_history);
    const tab = path_to_tab(opts.path);
    actions.set_active_tab(tab, {
      change_history: opts.change_history,
    });
  }

  if (alreadyOpened && opts.fragmentId) {
    // when file already opened we have to explicitly do this, since
    // it doesn't happen in response to foregrounding the file the
    // first time.
    actions.gotoFragment(opts.path, opts.fragmentId);
  }
}

// get user's group releative to this project.
// Can't easily use wait, since this depends on both the account
// and project stores changing.
// TODO: actually properly use wait somehow, since obviously it is
// possible (just not easy).
async function get_my_group(project_id: string): Promise<string> {
  return await retry_until_success({
    f: async () => {
      const projects_store = redux.getStore("projects");
      if (!projects_store) {
        throw Error("projects store not defined");
      }
      const group: string | undefined = projects_store.get_my_group(project_id);
      if (group) {
        return group;
      } else {
        throw Error("group not yet known");
      }
    },
    max_time: 60000,
    max_delay: 3000,
  });
}

async function open_sagenb_worksheet(opts: {
  project_id: string;
  path: string;
  foreground?: boolean;
  foreground_project?: boolean;
  chat?: boolean;
}): Promise<void> {
  // sagenb worksheet (or backup of it created during unzip of
  // multiple worksheets with same name)
  alert_message({
    type: "info",
    message: `Opening converted CoCalc worksheet file instead of '${opts.path}...`,
  });
  const actions = redux.getProjectActions(opts.project_id);
  try {
    const path: string = await convert_sagenb_worksheet(
      opts.project_id,
      opts.path,
    );
    await open_file(actions, {
      path,
      foreground: opts.foreground,
      foreground_project: opts.foreground_project,
      chat: opts.chat,
    });
  } catch (err) {
    alert_message({
      type: "error",
      message: `Error converting Sage Notebook sws file -- ${err}`,
    });
  }
}

async function convert_sagenb_worksheet(
  project_id: string,
  filename: string,
): Promise<string> {
  const ext = filename_extension(filename);
  if (ext != "sws") {
    const i = filename.length - ext.length;
    const new_filename = filename.slice(0, i - 1) + ext.slice(3) + ".sws";
    await webapp_client.project_client.exec({
      project_id,
      command: "cp",
      args: [filename, new_filename],
    });
    filename = new_filename;
  }
  await webapp_client.project_client.exec({
    project_id,
    command: "smc-sws2sagews",
    args: [filename],
  });

  return filename.slice(0, filename.length - 3) + "sagews";
}

const log_open_time: { [path: string]: { id: string; start: Date } } = {};

export function log_file_open(
  project_id: string,
  path: string,
  deleted?: number,
): void {
  // Only do this if the file isn't
  // deleted, since if it *is* deleted, then user sees a dialog
  // and we only log the open if they select to recreate the file.
  // See https://github.com/sagemathinc/cocalc/issues/4720
  if (!deleted && webapp_client.file_client.is_deleted(path, project_id)) {
    return;
  }

  redux.getActions("file_use")?.mark_file(project_id, path, "open");
  const actions = redux.getProjectActions(project_id);
  const id = actions.log({
    event: "open",
    action: "open",
    filename: path,
    deleted,
  });

  // Save the log entry id, so it is possible to optionally
  // record how long it took for the file to open.  This
  // may happen via a call from random places in our codebase,
  // since the idea of "finishing opening and rendering" is
  // not simple to define.
  if (id !== undefined) {
    const key = `${project_id}-${path}`;
    log_open_time[key] = {
      id,
      start: webapp_client.server_time(),
    };
  }
}

export function log_opened_time(project_id: string, path: string): void {
  // Call log_opened with a path to update the log with the fact that
  // this file successfully opened and rendered so that the user can
  // actually see it.  This is used to get a sense for how long things
  // are taking...
  const key = `${project_id}-${path}`;
  const data = log_open_time[key];
  if (data == null) {
    // never setup log event recording the start of open (this would get set in @open_file)
    return;
  }
  const { id, start } = data;
  // do not allow recording the time more than once, which would be weird.
  delete log_open_time[key];
  const actions = redux.getProjectActions(project_id);
  const time = webapp_client.server_time().valueOf() - start.valueOf();
  actions.log({ time }, id);
}

// This modifies the opts object passed into it:
function get_side_chat_state(
  project_id: string,
  opts: {
    path: string;
    chat?: boolean;
    chat_width?: number;
  },
): void {
  // grab chat state from local storage
  if (local_storage != null) {
    if (opts.chat == null) {
      opts.chat = local_storage(project_id, opts.path, "chatState");
    }
    if (opts.chat_width == null) {
      opts.chat_width = local_storage(project_id, opts.path, "chat_width");
    }
  }

  if (filename_extension(opts.path) === "sage-chat") {
    opts.chat = false;
  }
}

export function canonicalPath(path: string) {
  if (path.endsWith(".ipynb")) {
    return ipynbSyncdbPath(path);
  }
  if (path.endsWith("term") && path[0] != ".") {
    return termPath({ path, cmd: "", number: 0 });
  }
  return path;
}

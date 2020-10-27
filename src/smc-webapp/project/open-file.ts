/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Implement the open_file actions for opening one single file in a project.

import { callback, delay } from "awaiting";
import {
  defaults,
  endswith,
  filename_extension,
  filename_extension_notilde,
  meta_file,
  path_to_tab,
  required,
  uuid,
} from "smc-util/misc";
import { retry_until_success } from "smc-util/async-utils";
import { ProjectActions } from "../project_actions";
import { SITE_NAME } from "smc-util/theme";
import { editor_id } from "./utils";
import { redux } from "../app-framework";
import { alert_message } from "../alerts";
import { webapp_client } from "../webapp-client";
import { init as init_chat } from "../chat/register";
import { normalize } from "./utils";
import { ensure_project_running } from "./project-start-warning";

const { local_storage } = require("../editor");
//import { local_storage } from "../editor";

import { remove } from "../project-file";

export async function open_file(
  actions: ProjectActions,
  opts: {
    path: string;
    foreground?: boolean;
    foreground_project?: boolean;
    chat?: any;
    chat_width?: number;
    ignore_kiosk?: boolean;
    new_browser_window?: boolean;
    change_history?: boolean;
    // anchor -- if given, try to jump to scroll to this id in the editor, after it
    // renders and is put in the foreground (ignored if foreground not true)
    anchor?: string;
  }
): Promise<void> {
  if (endswith(opts.path, "/")) {
    actions.open_directory(opts.path);
    return;
  }
  if (
    !(await ensure_project_running(
      actions.project_id,
      `open the file '${opts.path}'`
    ))
  ) {
    return;
  }

  opts = defaults(opts, {
    path: required,
    foreground: true,
    foreground_project: true,
    chat: undefined,
    chat_width: undefined,
    ignore_kiosk: false,
    new_browser_window: false,
    change_history: true,
    anchor: undefined,
  });
  opts.path = normalize(opts.path);
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
    if (opts.path != realpath) {
      alert_message({
        type: "info",
        message: `Opening realpath "${realpath}" instead, since filesystem links are not fully supported.`,
        timeout: 15,
      });
      opts.path = realpath;
    }
  } catch (_) {
    // TODO: old projects will not have the new realpath api call -- can delete this try/catch at some point.
  }
  const ext = filename_extension_notilde(opts.path).toLowerCase();

  // intercept any requests if in kiosk mode
  if (
    !opts.ignore_kiosk &&
    (redux.getStore("page") as any).get("fullscreen") === "kiosk"
  ) {
    alert_message({
      type: "error",
      message: `CoCalc is in Kiosk mode, so you may not open new files.  Please try visiting ${document.location.origin} directly.`,
      timeout: 15,
    });
    return;
  }

  if (opts.new_browser_window) {
    // options other than path are ignored in this case.
    // TODO: do not ignore anchor option.
    actions.open_in_new_browser_window(opts.path);
    return;
  }

  let store = actions.get_store();
  if (store == undefined) {
    return;
  }

  let open_files = store.get("open_files");
  if (!open_files.has(opts.path)) {
    // Make the visible tab appear ASAP, even though
    // some stuff that may await below needs to happen...
    if (!actions.open_files) return; // closed
    actions.open_files.set(opts.path, "component", {});
  }

  // Returns true if the project is closed or the file tab is now closed.
  function is_closed(): boolean {
    const store = actions.get_store();
    // if store isn't defined (so project closed) *or*
    // open_files doesn't have path in since tab got closed
    // (see https://github.com/sagemathinc/cocalc/issues/4692):
    return store?.getIn(["open_files", opts.path]) == null;
  }

  // Next get the group.
  let group: string;
  try {
    group = await get_my_group(actions.project_id);
    if (is_closed()) return;
  } catch (err) {
    actions.set_activity({
      id: uuid(),
      error: `opening file '${opts.path}' (error getting group) -- ${err}`,
    });
    return;
  }
  const is_public = group === "public";

  if (!is_public) {
    // Check if have capability to open this file.  Important
    // to only do this if not public, since again, if public we
    // are not even using the project (it is all client side).
    // NOTE: I think this is wrong; we should always open any file
    // and instead of saying "can't open it", instead just fall
    // back to a codemirror text editor...   After all, that's what
    // we already do with all uknown file types.
    const can_open_file = await store.can_open_file_ext(ext, actions);
    if (is_closed()) return;
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
      await callback(actions._ensure_project_is_open);
    } catch (err) {
      actions.set_activity({
        id: uuid(),
        error: `Error opening file '${opts.path}' (error ensuring project is open) -- ${err}`,
      });
      return;
    }
    if (is_closed()) return;
  }

  if (!is_public && (ext === "sws" || ext.slice(0, 4) === "sws~")) {
    await open_sagenb_worksheet({ ...opts, project_id: actions.project_id });
    return;
  }

  if (!is_public) {
    get_side_chat_state(actions.project_id, opts);
  }

  store = actions.get_store(); // because async stuff happened above.
  if (store == undefined) return;

  // Only generate the editor component if we don't have it already
  // Also regenerate if view type (public/not-public) changes.
  // (TODO: get rid of that change code since public is deprecated)
  open_files = store.get("open_files");
  if (open_files == null || actions.open_files == null) {
    // project is closing
    return;
  }
  const file_info = open_files.getIn([opts.path, "component"], {
    is_public: false,
  });
  if (!open_files.has(opts.path) || file_info.is_public !== is_public) {
    const was_public = file_info.is_public;

    if (was_public != null && was_public !== is_public) {
      actions.open_files.delete(opts.path);
      remove(opts.path, redux, actions.project_id, was_public);
    }

    // Add it to open files
    actions.open_files.set(opts.path, "component", { is_public });
    actions.open_files.set(opts.path, "chat_width", opts.chat_width);

    if (opts.chat) {
      init_chat(meta_file(opts.path, "chat"), redux, actions.project_id);
      // ONLY do this *after* initializing actions/store for side chat:
      actions.open_files.set(opts.path, "is_chat_open", opts.chat);
    }

    redux.getActions("page").save_session();
  }

  if (opts.foreground) {
    actions.foreground_project(opts.change_history);
    const tab = path_to_tab(opts.path);
    actions.set_active_tab(tab, {
      change_history: opts.change_history,
    });
    if (opts.anchor) {
      // Scroll the *visible* one into view.  NOTE: it's possible
      // that several notebooks (say) are all open in background tabs
      // and all have the same anchor tag in them; we only want to
      // try to scroll the visible one or ones.
      // We also have no reliable way to know if the editor has
      // fully loaded yet, so we just try until the tag appears
      // up to 15s.  Someday, we will have to make it so editors
      // somehow clearly indicate when they are done loading, and
      // we can use that to do this right.
      const start: number = new Date().valueOf();
      const id = editor_id(actions.project_id, opts.path);
      while (new Date().valueOf() - start.valueOf() <= 15000) {
        await delay(100);
        const store = actions.get_store();
        if (store == undefined) break;
        if (tab != store.get("active_project_tab")) break;
        const e = $("#" + id).find("#" + opts.anchor);
        if (e.length > 0) {
          // We iterate through all of them in this visible editor.
          // Because of easy editor splitting we could easily have multiple
          // copies of the same id, and we move them all into view.
          // Change this to break after the first one if this annoys people;
          // it's not clear what the "right" design is.
          for (const x of e) {
            x.scrollIntoView();
          }
          break;
        } else {
          await delay(100);
        }
      }
    }
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
      opts.path
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
  filename: string
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

export function log_file_open(project_id: string, path: string): void {
  // Only do this if the file isn't
  // deleted, since if it *is* deleted, then user sees a dialog
  // and we only log the open if they select to recreate the file.
  // See https://github.com/sagemathinc/cocalc/issues/4720
  if (webapp_client.file_client.is_deleted(path, project_id)) {
    return;
  }

  redux.getActions("file_use")?.mark_file(project_id, path, "open");
  const actions = redux.getProjectActions(project_id);
  const id = actions.log({
    event: "open",
    action: "open",
    filename: path,
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
  }
): void {
  // grab chat state from local storage
  if (local_storage != null) {
    if (opts.chat == null) {
      opts.chat = local_storage(project_id, opts.path, "is_chat_open");
    }
    if (opts.chat_width == null) {
      opts.chat_width = local_storage(project_id, opts.path, "chat_width");
    }
  }

  if (filename_extension(opts.path) === "sage-chat") {
    opts.chat = false;
  }
}

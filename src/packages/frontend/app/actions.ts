/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Actions, redux } from "@cocalc/frontend/app-framework";
import { set_window_title } from "@cocalc/frontend/browser";
import { set_url, update_params } from "@cocalc/frontend/history";
import { labels } from "@cocalc/frontend/i18n";
import { getIntl } from "@cocalc/frontend/i18n/get-intl";
import {
  exitFullscreen,
  isFullscreen,
  requestFullscreen,
} from "@cocalc/frontend/misc/fullscreen";
import { disconnect_from_project } from "@cocalc/frontend/project/websocket/connect";
import { session_manager } from "@cocalc/frontend/session";
import { once } from "@cocalc/util/async-utils";
import { PageState } from "./store";
import { lite, project_id } from "@cocalc/frontend/lite";

const LITE_TABS = new Set(["account", "admin"]);

export class PageActions extends Actions<PageState> {
  private session_manager?: any;
  private active_key_handler?: any;
  private suppress_key_handlers: boolean = false;
  private popconfirmIsOpen: boolean = false;
  private settingsModalIsOpen: boolean = false;

  /* Expects a func which takes a browser keydown event
     Only allows one keyhandler to be active at a time.
     FUTURE: Develop more general way to make key mappings for editors
     HACK: __suppress_key_handlers is for file_use. See FUTURE above.
           Adding even a single suppressor leads to spaghetti code.
           Don't do it. -- J3

     ws: added logic with project_id/path so that
     only the currently focused editor can set/unset
     the keyboard handler -- see https://github.com/sagemathinc/cocalc/issues/2826
     This feels a bit brittle though, but obviously something like this is needed,
     due to slightly async calls to set_active_key_handler, and expecting editors
     to do this is silly.
  */
  public set_active_key_handler(
    handler?: (e) => void,
    project_id?: string,
    path?: string, // IMPORTANT: This is the path for the tab! E.g., if setting keyboard handler for a frame, make sure to pass path for the tab. This is a terrible and confusing design and needs to be redone, probably via a hook!
  ): void {
    if (project_id != null) {
      if (
        this.redux.getStore("page").get("active_top_tab") !== project_id ||
        this.redux.getProjectStore(project_id)?.get("active_project_tab") !==
          "editor-" + path
      ) {
        return;
      }
    }

    if (handler != null) {
      $(window).off("keydown", this.active_key_handler);
      this.active_key_handler = handler;
    }

    if (this.active_key_handler != null && !this.suppress_key_handlers) {
      $(window).on("keydown", this.active_key_handler);
    }
  }

  // Only clears it from the window
  public unattach_active_key_handler() {
    $(window).off("keydown", this.active_key_handler);
  }

  // Actually removes the handler from active memory
  // takes a handler to only remove if it's the active one
  public erase_active_key_handler(handler?) {
    if (handler == null || handler === this.active_key_handler) {
      $(window).off("keydown", this.active_key_handler);
      this.active_key_handler = undefined;
    }
  }

  // FUTURE: Will also clear all click handlers.
  // Right now there aren't even any ways (other than manually)
  // of adding click handlers that the app knows about.
  public clear_all_handlers() {
    $(window).off("keydown", this.active_key_handler);
    this.active_key_handler = undefined;
  }

  private add_a_ghost_tab(): void {
    const current_num = redux.getStore("page").get("num_ghost_tabs");
    this.setState({ num_ghost_tabs: current_num + 1 });
  }

  public clear_ghost_tabs(): void {
    this.setState({ num_ghost_tabs: 0 });
  }

  public close_project_tab(project_id: string): void {
    const page_store = redux.getStore("page");
    const projects_store = redux.getStore("projects");

    const open_projects = projects_store.get("open_projects");
    const active_top_tab = page_store.get("active_top_tab");

    const index = open_projects.indexOf(project_id);
    if (index === -1) {
      return;
    }

    if (this.session_manager != null) {
      this.session_manager.close_project(project_id);
    } // remembers what files are open

    const { size } = open_projects;
    if (project_id === active_top_tab) {
      let next_active_tab;
      if (index === -1 || size <= 1) {
        next_active_tab = "projects";
      } else if (index === size - 1) {
        next_active_tab = open_projects.get(index - 1);
      } else {
        next_active_tab = open_projects.get(index + 1);
      }
      this.set_active_tab(next_active_tab);
    }

    // The point of these "ghost tabs" is to make it so you can quickly close several
    // open tabs, like in Chrome.
    if (index === size - 1) {
      this.clear_ghost_tabs();
    } else {
      this.add_a_ghost_tab();
    }

    redux.getActions("projects").set_project_closed(project_id);
    this.save_session();

    // if there happens to be a websocket to this project, get rid of it.
    // Nothing will be using it when the project is closed.
    disconnect_from_project(project_id);
  }

  set_active_tab = async (key, change_history = true): Promise<void> => {
    if (lite) {
      if (!LITE_TABS.has(key)) {
        key = project_id;
      }
    }

    const prev_key = this.redux.getStore("page").get("active_top_tab");
    this.setState({ active_top_tab: key });

    if (prev_key !== key && prev_key?.length == 36) {
      // fire hide action on project we are switching from.
      redux.getProjectActions(prev_key)?.hide();
    }
    if (key?.length == 36) {
      // fire show action on project we are switching to
      redux.getProjectActions(key)?.show();
    }

    const intl = await getIntl();

    switch (key) {
      case "projects":
        if (change_history) {
          set_url("/projects");
        }
        set_window_title(intl.formatMessage(labels.projects));
        return;
      case "account":
      case "settings":
        if (change_history) {
          redux.getActions("account").push_state();
        }
        set_window_title(intl.formatMessage(labels.account));
        return;
      case "file-use": // this doesn't actually get used currently
        if (change_history) {
          set_url("/file-use");
        }
        set_window_title("File Usage");
        return;
      case "admin":
        if (change_history) {
          set_url("/admin");
        }
        set_window_title(intl.formatMessage(labels.admin));
        return;
      case "hosts":
        if (change_history) {
          set_url("/hosts");
        }
        set_window_title("Project Hosts");
        return;
      case "notifications":
        if (change_history) {
          set_url("/notifications");
        }
        set_window_title(intl.formatMessage(labels.messages_title));
        return;
      case "auth": {
        if (change_history) {
          const auth_view =
            this.redux.getStore("page").get("auth_view") ?? "sign-in";
          const auth_path =
            auth_view === "sign-up"
              ? "/auth/sign-up"
              : auth_view === "password-reset"
                ? "/auth/password-reset"
                : "/auth/sign-in";
          set_url(auth_path);
        }
        set_window_title("Sign in");
        return;
      }
      case undefined:
        return;
      default:
        if (change_history) {
          redux.getProjectActions(key)?.push_state();
        }
        set_window_title("Loading Project");
        var projects_store = redux.getStore("projects");

        if (projects_store.date_when_course_payment_required(key)) {
          redux
            .getActions("projects")
            .apply_default_upgrades({ project_id: key });
        }

        try {
          const title: string = await projects_store.async_wait({
            until: (store): string | undefined => {
              let title: string | undefined = store.getIn([
                "project_map",
                key,
                "title",
              ]);
              if (title == null) {
                title = store.getIn(["public_project_titles", key]);
              }
              if (title === "") {
                return "Untitled Project";
              }
              if (title == null) {
                redux.getActions("projects").fetch_public_project_title(key);
              }
              return title;
            },
            timeout: 15,
          });
          set_window_title(title);
        } catch (err) {
          set_window_title("");
        }
    }
  };

  show_connection(show_connection) {
    this.setState({ show_connection });
  }

  // Suppress the activation of any new key handlers
  disableGlobalKeyHandler = () => {
    this.suppress_key_handlers = true;
    this.unattach_active_key_handler();
  };
  // Enable whatever the current key handler should be
  enableGlobalKeyHandler = () => {
    this.suppress_key_handlers = false;
    this.set_active_key_handler();
  };

  // Toggles visibility of file use widget
  // Temporarily disables window key handlers until closed
  // FUTURE: Develop more general way to make key mappings
  toggle_show_file_use() {
    const currently_shown = redux.getStore("page").get("show_file_use");
    if (currently_shown) {
      this.enableGlobalKeyHandler(); // HACK: Terrible way to do this.
    } else {
      // Suppress the activation of any new key handlers until file_use closes
      this.disableGlobalKeyHandler(); // HACK: Terrible way to do this.
    }

    this.setState({ show_file_use: !currently_shown });
  }

  set_ping(ping, avgping) {
    this.setState({ ping, avgping });
  }

  set_connection_status = (connection_status, time: Date) => {
    this.setState({ connection_status, last_status_time: time });
  };

  set_connection_quality(connection_quality) {
    this.setState({ connection_quality });
  }

  set_new_version(new_version) {
    this.setState({ new_version });
  }

  async set_fullscreen(
    fullscreen?: "default" | "kiosk" | "project" | undefined,
  ) {
    // val = 'default', 'kiosk', 'project', undefined
    // if kiosk is ever set, disable toggling back
    if (redux.getStore("page").get("fullscreen") === "kiosk") {
      return;
    }
    this.setState({ fullscreen });
    if (fullscreen == "project") {
      // this removes top row for embedding purposes and thus doesn't need
      // full browser fullscreen.
      return;
    }
    if (fullscreen) {
      try {
        await requestFullscreen();
      } catch (err) {
        // gives an error if not initiated explicitly by user action,
        // or not available (e.g., iphone)
        console.log(err);
      }
    } else {
      if (isFullscreen()) {
        exitFullscreen();
      }
    }
  }

  set_get_api_key(val) {
    this.setState({ get_api_key: val });
    update_params();
  }

  toggle_fullscreen() {
    this.set_fullscreen(
      redux.getStore("page").get("fullscreen") != null ? undefined : "default",
    );
  }

  set_session(session) {
    // If existing different session, close it.
    if (session !== redux.getStore("page").get("session")) {
      if (this.session_manager != null) {
        this.session_manager.close();
      }
      delete this.session_manager;
    }

    // Save state and update URL.
    this.setState({ session });

    // Make new session manager, but only register it if we have
    // an actual session name!
    if (!this.session_manager) {
      const sm = session_manager(session, redux);
      if (session) {
        this.session_manager = sm;
      }
    }
  }

  save_session() {
    this.session_manager?.save();
  }

  restore_session(project_id) {
    this.session_manager?.restore(project_id);
  }

  show_cookie_warning() {
    this.setState({ cookie_warning: true });
  }

  show_local_storage_warning() {
    this.setState({ local_storage_warning: true });
  }

  check_unload(_) {
    if (redux.getStore("page").get("get_api_key")) {
      // never confirm close if get_api_key is set.
      return;
    }
    const fullscreen = redux.getStore("page").get("fullscreen");
    if (fullscreen == "kiosk" || fullscreen == "project") {
      // never confirm close in kiosk or project embed mode, since that should be
      // responsibility of containing page, and it's confusing where
      // the dialog is even coming from.
      return;
    }
    // Returns a defined string if the user should confirm exiting the site.
    const s = redux.getStore("account");
    if (
      (s != null ? s.get_user_type() : undefined) === "signed_in" &&
      (s != null ? s.get_confirm_close() : undefined)
    ) {
      return "Changes you make may not have been saved.";
    } else {
      return;
    }
  }

  set_sign_in_func(func) {
    this.sign_in = func;
  }

  remove_sign_in_func() {
    this.sign_in = () => false;
  }

  // Expected to be overridden by functions above
  sign_in() {
    return false;
  }

  // The code below is complicated and tricky because multiple parts of our codebase could
  // call it at the "same time".  This happens, e.g., when opening several Jupyter notebooks
  // on a compute server from the terminal using the open command.
  // By "same time", I mean a second call to popconfirm comes in while the first is async
  // awaiting to finish.  We handle that below by locking while waiting.  Since only one
  // thing actually happens at a time in Javascript, the below should always work with
  // no deadlocks.  It's tricky looking code, but MUCH simpler than alternatives I considered.
  popconfirm = async (opts): Promise<boolean> => {
    const store = redux.getStore("page");
    // wait for any currently open modal to be done.
    while (this.popconfirmIsOpen) {
      await once(store, "change");
    }
    // we got it, so let's take the lock
    try {
      this.popconfirmIsOpen = true;
      // now we do it -- this causes the modal to appear
      this.setState({ popconfirm: { open: true, ...opts } });
      // wait for our to be done
      while (store.getIn(["popconfirm", "open"])) {
        await once(store, "change");
      }
      // report result of ours.
      return !!store.getIn(["popconfirm", "ok"]);
    } finally {
      // give up the lock
      this.popconfirmIsOpen = false;
      // trigger a change, so other code has a chance to get the lock
      this.setState({ popconfirm: { open: false } });
    }
  };

  settings = async (name) => {
    if (!name) {
      this.setState({ settingsModal: "" });
      this.settingsModalIsOpen = false;
      return;
    }
    const store = redux.getStore("page");
    while (this.settingsModalIsOpen) {
      await once(store, "change");
    }
    try {
      this.settingsModalIsOpen = true;
      this.setState({ settingsModal: name });
      while (store.get("settingsModal")) {
        await once(store, "change");
      }
    } finally {
      this.settingsModalIsOpen = false;
    }
  };
}

export function init_actions() {
  redux.createActions("page", PageActions);
}

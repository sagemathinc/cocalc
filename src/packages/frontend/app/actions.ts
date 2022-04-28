/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux, Actions } from "../app-framework";
import { set_window_title } from "../browser";
import { update_params, set_url } from "../history";
import { disconnect_from_project } from "../project/websocket/connect";
import { session_manager } from "../session";
import { PageState } from "./store";

export class PageActions extends Actions<PageState> {
  private session_manager?: any;
  private active_key_handler?: any;
  private suppress_key_handlers: boolean = false;

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
    path?: string  // IMPORTANT: This is the path for the tab! E.g., if setting keyboard handler for a frame, make sure to pass path for the tab. This is a terrible and confusing design and needs to be redone, probably via a hook!
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
    } else {
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

  async set_active_tab(key, change_history = true): Promise<void> {
    const prev_key = this.redux.getStore("page").get("active_top_tab");
    this.setState({ active_top_tab: key });

    if (
      (prev_key != null ? prev_key.length : undefined) === 36 &&
      prev_key !== key
    ) {
      // fire hide actions on project we are switching from.
      redux.getProjectActions(prev_key)?.hide();
    }
    if ((key != null ? key.length : undefined) === 36) {
      // fire show action on project we are switching to
      redux.getProjectActions(key)?.show();
    }

    switch (key) {
      case "projects":
        if (change_history) {
          set_url("/projects");
        }
        set_window_title("Projects");
        return;
      case "account":
        if (change_history) {
          redux.getActions("account").push_state();
        }
        set_window_title("Account");
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
        set_window_title("Admin");
        return;
      case "notifications":
        if (change_history) {
          set_url("/notifications");
        }
        set_window_title("Notifications");
        return;
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
  }

  show_connection(show_connection) {
    this.setState({ show_connection });
  }

  // Toggles visibility of file use widget
  // Temporarily disables window key handlers until closed
  // FUTURE: Develop more general way to make key mappings
  toggle_show_file_use() {
    const currently_shown = redux.getStore("page").get("show_file_use");
    if (currently_shown) {
      // Enable whatever the current key handler should be
      this.suppress_key_handlers = false; // HACK: Terrible way to do this.
      this.set_active_key_handler();
    } else {
      // Suppress the activation of any new key handlers until file_use closes
      this.suppress_key_handlers = true;
      this.unattach_active_key_handler();
    }

    this.setState({ show_file_use: !currently_shown });
  }

  set_ping(ping, avgping) {
    this.setState({ ping, avgping });
  }

  set_connection_status(connection_status, time: Date) {
    if (time > (redux.getStore("page").get("last_status_time") ?? 0)) {
      this.setState({ connection_status, last_status_time: time });
    }
  }

  set_connection_quality(connection_quality) {
    this.setState({ connection_quality });
  }

  set_new_version(new_version) {
    this.setState({ new_version });
  }

  set_fullscreen(fullscreen) {
    // val = 'default', 'kiosk', undefined
    // if kiosk is ever set, disable toggling back
    if (redux.getStore("page").get("fullscreen") === "kiosk") {
      return;
    }
    this.setState({ fullscreen });
    update_params();
  }

  set_get_api_key(val) {
    this.setState({ get_api_key: val });
    update_params();
  }

  toggle_fullscreen() {
    this.set_fullscreen(
      redux.getStore("page").get("fullscreen") != null ? undefined : "default"
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
    update_params();

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
}

export function init_actions() {
  redux.createActions("page", PageActions);
}

/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Generic register function -- used by each frame tree editor to register itself with CoCalc

Basically, this is like register_file_editor, but much more specialized.
*/

import { register_file_editor as general_register_file_editor } from "../../file-editors";
import { redux_name } from "../../app-framework";

interface Register {
  icon?: string;
  ext:
    | string
    | string[] /* the filename extension or extensions that this editor should handle. */;
  component: any /* the renderable react component used for this editor */;
  Actions: any /* the class that defines the actions. */;
  is_public?: boolean /* if given, only register public or not public editors (not both) */;
}

export function register_file_editor(opts: Register) {
  const v: boolean[] = [];
  if (opts.is_public != undefined) {
    v.push(!!opts.is_public);
  } else {
    v.push(true);
    v.push(false);
  }
  for (const is_public of v) {
    register(opts.icon, opts.ext, opts.component, opts.Actions, is_public);
  }
}

const reference_count: { [name: string]: number } = {};

// uncomment for debugging
(window as any).frame_editor_reference_count = reference_count;

function register(
  icon: string | undefined,
  ext: string | string[],
  component,
  Actions,
  is_public: boolean
) {
  const data = {
    icon,
    ext,
    is_public,
    component,
    init(path: string, redux, project_id: string) {
      const name = redux_name(project_id, path, is_public);
      if (reference_count[name] == undefined) {
        reference_count[name] = 1;
      } else {
        reference_count[name] += 1;
      }
      if (redux.getActions(name) != null) {
        return name; // already initialized
      }
      // We purposely are just using the simple default store; that's all that is needed
      // for these editors.
      const store = redux.createStore(name);
      const actions = redux.createActions(name, Actions);

      // Call the base class init.  (NOTE: it also calls _init2 if defined.)
      actions._init(project_id, path, is_public, store);

      return name;
    },

    remove(path: string, redux, project_id: string): string {
      const name = redux_name(project_id, path, is_public);
      if (reference_count[name] != undefined) {
        reference_count[name] -= 1;
        if (reference_count[name] > 0) return name;
        delete reference_count[name];
      }
      const actions = redux.getActions(name);
      if (actions != null) {
        actions.close();
        redux.removeActions(name);
      }
      const store = redux.getStore(name);
      if (store != null) {
        delete store.state;
        redux.removeStore(name);
      }
      return name;
    },

    save(path: string, redux, project_id: string): void {
      if (is_public) return;
      const name = redux_name(project_id, path, is_public);
      const actions = redux.getActions(name);
      if (actions) {
        actions.save();
      }
    },
  };
  general_register_file_editor(data);
  if (typeof ext == "string") {
    ext = [ext];
  }
  for (const e of ext) {
    REGISTRY[key(e, is_public)] = data;
  }
}

const REGISTRY: { [key: string]: any } = {};

export function get_file_editor(ext: string, is_public: boolean) {
  return REGISTRY[key(ext, is_public)];
}

function key(ext: string, is_public: boolean): string {
  return `${is_public}-${ext}`;
}

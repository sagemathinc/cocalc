/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Generic register function -- used by each frame tree editor to register itself with CoCalc

Basically, this is like register_file_editor, but much more specialized.
*/

import type { IconName } from "@cocalc/frontend/components/icon";

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { register_file_editor as general_register_file_editor } from "@cocalc/frontend/file-editors";
import { redux_name } from "@cocalc/frontend/app-framework";

interface AsyncRegister {
  icon?: IconName;
  ext: string | string[];
  editor: () => Promise<any>;
  actions: () => Promise<any>;
  is_public?: boolean;
}

interface Register {
  icon?: IconName;
  ext:
    | string
    | string[] /* the filename extension or extensions that this editor should handle. */;
  component?: any /* the renderable react component used for this editor */;
  Actions?: any /* the class that defines the actions. */;
  asyncData?: () => Promise<{
    component: any;
    Actions: any;
  }> /* async function that returns the component and Actions instead. */;
  is_public?: boolean /* if given, only register public or not public editors (not both) */;
}

function isAsyncRegister(
  opts: Register | AsyncRegister,
): opts is AsyncRegister {
  return opts["editor"] != null;
}

export function register_file_editor(opts: Register | AsyncRegister) {
  if (isAsyncRegister(opts)) {
    // AsyncRegister
    register_file_editor({
      icon: opts.icon,
      ext: opts.ext,
      asyncData: async () => {
        const component = (await opts.editor()).Editor;
        const Actions = (await opts.actions()).Actions;
        return { component, Actions };
      },
      is_public: opts.is_public,
    });
    return;
  }
  const v: boolean[] = [];
  if (opts.is_public != undefined) {
    v.push(!!opts.is_public);
  } else {
    v.push(true);
    v.push(false);
  }
  for (const is_public of v) {
    register(
      opts.icon,
      opts.ext,
      opts.component,
      opts.Actions,
      opts.asyncData,
      is_public,
    );
  }
}

const reference_count: { [name: string]: number } = {};

declare const DEBUG; // webpack.
if (DEBUG) {
  // uncomment for low level debugging
  // (window as any).frame_editor_reference_count = reference_count;
}

function register(
  icon: IconName | undefined,
  ext: string | string[],
  component: any,
  Actions: any,
  asyncData:
    | undefined
    | (() => Promise<{
        component: any;
        Actions: any;
      }>),
  is_public: boolean,
) {
  let data: any = {
    icon,
    ext,
    is_public,

    remove(path: string, redux, project_id: string): string {
      const name = redux_name(project_id, path);
      if (reference_count[name] != undefined) {
        reference_count[name] -= 1;
        if (reference_count[name] > 0) return name;
        delete reference_count[name];
      }
      const actions = redux.getActions(name);

      if (actions != null) {
        actions.close();
        redux.removeActions(name);
        // Remove TimeTravel actions for this path, which would have been
        // created if we opened a TimeTravel frame.  However, we *don't* do this
        // if there is a separate TimeTravel editor on the same file also opened
        // in another tab, which you could get via shift+click on TimeTravel.
        // See https://github.com/sagemathinc/cocalc/issues/6540
        if (actions.timeTravelActions != null) {
          if (
            // check that not open in another tab.
            !redux
              .getProjectStore(project_id)
              ?.getIn(["open_files", actions.timeTravelActions.path])
          ) {
            actions.timeTravelActions.close();
            redux.removeActions(actions.timeTravelActions.name);
            redux.removeStore(actions.timeTravelActions.name);
          }
        }
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
      const name = redux_name(project_id, path);
      const actions = redux.getActions(name);
      actions?.save?.();
    },
  };

  function init(Actions) {
    return (path: string, redux, project_id: string) => {
      const name = redux_name(project_id, path);
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
    };
  }

  if (component != null && Actions != null) {
    data.component = component;
    data.init = init(Actions);
  } else {
    if (asyncData == null) {
      throw Error(
        "either asyncData must be given or components and Actions must be given (or both)",
      );
    }
    let async_data: any = undefined;
    // so calls to componentAsync and initAsync don't happen at once!
    const getAsyncData = reuseInFlight(asyncData);

    data.componentAsync = async () => {
      if (async_data == null) {
        async_data = await getAsyncData();
      }
      return async_data.component;
    };

    data.initAsync = async (path: string, redux, project_id: string) => {
      if (async_data == null) {
        async_data = await getAsyncData();
      }
      return init(async_data.Actions)(path, redux, project_id);
    };
  }

  general_register_file_editor(data);
  if (typeof ext == "string") {
    ext = [ext];
  }
  for (const e of ext) {
    REGISTRY[key(e, is_public)] = data;
  }
}

const REGISTRY: { [key: string]: any } = {};

export function get_file_editor(ext: string, is_public: boolean = false) {
  return REGISTRY[key(ext, is_public)];
}

function key(ext: string, is_public: boolean): string {
  return `${is_public}-${ext}`;
}

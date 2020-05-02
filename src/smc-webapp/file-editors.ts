/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  filename_extension_notilde,
  meta_file,
  path_split,
  defaults,
  required,
} from "smc-util/misc";

import { React } from "./app-framework";

import { delay } from "awaiting";

declare let DEBUG: boolean;

type Elt = any;

/*
component : rclass|function
generator : function (path, redux, project_id) -> rclass|function
    * One or the other. Calling generator should give the component
init      : function (path, redux, project_id) -> string (redux name)
    * Should initialize all stores, actions, sync, etc

remove    : function (path, redux, project_id) -> string (redux name)
    * Should remove all stores, actions, sync, etc
*/

interface FileEditorSpec {
  icon?: string;
  component?: Elt | Function;
  generator?: (
    path: string,
    redux: any,
    project_id: string | undefined
  ) => Elt | Function;
  init?: (
    path: string,
    redux: any,
    project_id: string | undefined,
    content?: string
  ) => string; // returned string = redux name
  remove?: (path: string, redux: any, project_id: string | undefined) => string; // returned string = redux name
  save?: (
    path: string,
    redux: any,
    project_id: string,
    is_public?: boolean
  ) => void;
}

// Map of extensions to the appropriate structures below
const file_editors: {
  [is_public: string]: { [ext: string]: FileEditorSpec };
} = {
  true: {}, // true = is_public
  false: {}, // false = not public
};

export function icon(ext: string): string | undefined {
  if (file_editors["false"] == null || file_editors["true"] == null) {
    throw Error("bug");
  }
  // Return the icon name for the given extension, if it is defined here,
  // with preference for non-public icon; returns undefined otherwise.
  const not_public = file_editors["false"][ext];
  if (not_public != null) return not_public.icon;
  const pub = file_editors["true"][ext];
  if (pub != null) return pub.icon;
}

interface FileEditorInfo extends FileEditorSpec {
  ext: string | string[]; // extension to associate the editor with
  is_public?: boolean;
}

// component and generator could be merged. We only ever get one or the other.
export function register_file_editor(opts: FileEditorInfo): void {
  opts = defaults(opts, {
    ext: required,
    is_public: false,
    component: undefined, // react class
    generator: undefined, // function
    init: undefined, // function
    remove: undefined,
    icon: "file-o",
    save: undefined,
  }); // optional; If given, doing opts.save(path, redux, project_id) should save the document.

  if (typeof opts.ext === "string") {
    opts.ext = [opts.ext];
  }

  // Assign to the extension(s)
  for (const ext of opts.ext) {
    const pub: string = `${!!opts.is_public}`;
    if (DEBUG && file_editors[pub] && file_editors[pub][ext] != null) {
      console.warn(
        `duplicate registered extension '${pub}/${ext}' in register_file_editor`
      );
    }
    file_editors[pub][ext] = {
      icon: opts.icon,
      component: opts.component,
      generator: opts.generator,
      init: opts.init,
      remove: opts.remove,
      save: opts.save,
    };
  }
}

// Get editor for given path and is_public state.

function get_ed(path: string, is_public?: boolean): FileEditorSpec {
  const is_pub = `${!!is_public}`;
  const noext = `noext-${path_split(path).tail}`.toLowerCase();
  if (file_editors[is_pub] == null) throw Error("bug");
  const e = file_editors[is_pub][noext]; // special case: exact filename match
  if (e != null) {
    return e;
  }
  const ext = filename_extension_notilde(path).toLowerCase();
  // either use the one given by ext, or if there isn't one, use the '' fallback.
  const spec =
    file_editors[is_pub][ext] != null
      ? file_editors[is_pub][ext]
      : file_editors[is_pub][""];
  if (spec == null) {
    throw Error("bug -- spec must include fallback extension ''");
  }
  return spec;
}

// Performs things that need to happen before render
// Calls file_editors[ext].init()
// Examples of things that go here:
// - Initializing store state
// - Initializing Actions
export function initialize(
  path: string,
  redux,
  project_id: string | undefined,
  is_public: boolean,
  content?: string
): string | undefined {
  const editor = get_ed(path, is_public);
  if (editor.init != null) {
    return editor.init(path, redux, project_id, content);
  }
}

// Returns an editor instance for the path
export function generate(
  path: string,
  redux,
  project_id: string | undefined,
  is_public: boolean
) {
  const e = get_ed(path, is_public);
  const { generator } = e;
  if (generator != null) {
    return generator(path, redux, project_id);
  }
  const { component } = e;
  if (component == null) {
    return () =>
      React.createElement(
        "div",
        `No editor for ${path} or fallback editor yet`
      );
  }
  return component;
}

// Actually remove the given editor
export async function remove(
  path: string,
  redux,
  project_id: string | undefined,
  is_public: boolean
): Promise<string | undefined> {
  if (path == null) {
    return; // TODO: remove when all typescript
  }
  if (typeof path !== "string") {
    // TODO: remove when all typescript
    console.warn(
      `BUG -- remove called on path of type '${typeof path}'`,
      path,
      project_id
    );
    // see https://github.com/sagemathinc/cocalc/issues/1275
    return;
  }

  if (!is_public && project_id != null) {
    // always fire off a save to disk when closing.
    save(path, redux, project_id, is_public);
  }

  const e = get_ed(path, is_public);
  // Wait until the next render cycle before actually removing,
  // to give the UI a chance to save some state (e.g., scroll positions).
  await delay(0);
  if (typeof e.remove === "function") {
    return e.remove(path, redux, project_id);
  }

  if (!is_public) {
    // Also free the corresponding side chat, if it was created.
    require("./chat/register").remove(
      meta_file(path, "chat"),
      redux,
      project_id
    );
  }
}

// The save function may be called to request to save contents to disk.
// It does not take a callback.  It's a non-op if no save function is registered
// or the file isn't open.
export function save(
  path: string,
  redux,
  project_id: string,
  is_public: boolean
): void {
  if (path == null) {
    console.warn("WARNING: save(undefined path)"); // TODO: remove when all typescript
    return;
  }
  const save = get_ed(path, is_public).save;
  if (save != null) {
    save(path, redux, project_id);
  }
}

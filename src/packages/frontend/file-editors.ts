/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { delay } from "awaiting";

import type { IconName } from "@cocalc/frontend/components/icon";

import {
  filename_extension,
  meta_file,
  defaults,
  required,
} from "@cocalc/util/misc";

import { React } from "@cocalc/frontend/app-framework";

import { alert_message } from "./alerts";
import { getProjectEditorId } from "./extensions/project-config";
import { extensionRegistry } from "./extensions/registry";
import { file_associations, resolve_file_type } from "./file-associations";
import { EditorLoadError } from "./file-editors-error";

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
  id?: string;
  icon?: IconName;
  component?: Elt | Function;
  componentAsync?: () => Promise<Elt | Function>;
  generator?: (
    path: string,
    redux: any,
    project_id: string | undefined,
  ) => Elt | Function;
  initAsync?: (
    path: string,
    redux: any,
    project_id: string | undefined,
    content?: string,
  ) => Promise<string>; // returned string = redux name
  init?: (
    path: string,
    redux: any,
    project_id: string | undefined,
    content?: string,
  ) => string; // returned string = redux name
  remove?:
    | ((path: string, redux: any, project_id: string | undefined) => string) // returned string = redux name  or undefined if not using redux
    | ((path: string, redux: any, project_id: string | undefined) => void);
  save?: (path: string, redux: any, project_id: string) => void;
}

// Map of extensions to the appropriate structures below
const file_editors: { [ext: string]: FileEditorSpec[] } = {};
const file_editors_by_id: { [id: string]: FileEditorSpec } = {};

export function has_registered_editor(editorId: string | undefined): boolean {
  return editorId != null && file_editors_by_id[editorId] != null;
}

export function icon(ext: string): string | undefined {
  const candidates = file_editors[ext];
  return (
    resolve_candidate(
      candidates,
      ext,
      undefined,
      undefined,
      builtin_default_editor_id_for_ext(ext),
    )?.icon ?? candidates?.[candidates.length - 1]?.icon
  );
}

interface FileEditorInfo extends FileEditorSpec {
  id?: string;
  ext: string | readonly string[]; // extension(s) to associate the editor with
}

// component and generator could be merged. We only ever get one or the other.
export function register_file_editor(opts: FileEditorInfo): void {
  opts = defaults(opts, {
    id: undefined,
    ext: required,
    component: undefined, // react class
    componentAsync: undefined, // async function that returns a react component
    generator: undefined, // function
    init: undefined, // function
    initAsync: undefined, // async function
    remove: undefined,
    icon: "file-o",
    save: undefined,
  }); // optional; If given, doing opts.save(path, redux, project_id) should save the document.

  if (typeof opts.ext === "string") {
    opts.ext = [opts.ext];
  }

  const spec: FileEditorSpec = {
    id: opts.id,
    icon: opts.icon,
    component: opts.component,
    componentAsync: opts.componentAsync,
    generator: opts.generator,
    init: opts.init,
    initAsync: opts.initAsync,
    remove: opts.remove,
    save: opts.save,
  };

  // Assign to the extension(s)
  for (const ext of opts.ext) {
    file_editors[ext] = [
      ...(opts.id != null
        ? (file_editors[ext] ?? []).filter((editor) => editor.id !== opts.id)
        : (file_editors[ext] ?? [])),
      spec,
    ];
  }
  if (opts.id != null) {
    file_editors_by_id[opts.id] = spec;
  }
}

/**
 * Logs when a file extension falls back to the unknown editor.
 * This helps with debugging why an editor failed to load.
 */
function logFallback(ext: string | undefined, path: string): void {
  console.warn(
    `Editor fallback triggered: No editor found for ext '${
      ext ?? "unknown"
    }' on path '${path}', using unknown editor catchall`,
  );
}

const DEFAULT_EDITOR_IDS_BY_ASSOCIATION: { [name: string]: string } = {
  ai: "cocalc/agent-editor",
  board: "cocalc/whiteboard-editor",
  chat: "cocalc/chat-editor",
  codemirror: "cocalc/code-editor",
  course: "cocalc/course-editor",
  crm: "cocalc/crm-editor",
  "html-md": "cocalc/wiki-editor",
  ipynb: "cocalc/jupyter-editor",
  latex: "cocalc/latex-editor",
  pdf: "cocalc/pdf-editor",
  slides: "cocalc/slides-editor",
  tasks: "cocalc/task-editor",
  terminal: "cocalc/terminal-editor",
  x11: "cocalc/x11-editor",
};

const DEFAULT_EDITOR_IDS_BY_EXT: { [ext: string]: string } = {
  app: "cocalc/agent-editor",
  course: "cocalc/course-editor",
  "cocalc-crm": "cocalc/crm-editor",
  csv: "cocalc/csv-editor",
  html: "cocalc/html-editor",
  markdown: "cocalc/markdown-editor",
  md: "cocalc/markdown-editor",
  pdf: "cocalc/pdf-editor",
  qmd: "cocalc/qmd-editor",
  rmd: "cocalc/rmd-editor",
  rst: "cocalc/rst-editor",
  "sage-chat": "cocalc/chat-editor",
  sagews: "cocalc/sagews-editor",
  slides: "cocalc/slides-editor",
  tasks: "cocalc/task-editor",
  term: "cocalc/terminal-editor",
  "time-travel": "cocalc/time-travel-editor",
  wiki: "cocalc/wiki-editor",
  mediawiki: "cocalc/wiki-editor",
  x11: "cocalc/x11-editor",
};

export function builtin_default_editor_id_for_ext(
  ext: string | undefined,
): string | undefined {
  if (ext == null) {
    return;
  }
  const associationEditor = file_associations[ext]?.editor;
  if (associationEditor != null) {
    return DEFAULT_EDITOR_IDS_BY_ASSOCIATION[associationEditor];
  }
  return DEFAULT_EDITOR_IDS_BY_EXT[ext];
}

export function builtin_default_editor_id(
  path: string,
  ext?: string,
): string | undefined {
  const resolved = resolve_file_type(path, ext);
  ext = resolved.ext;
  const associationEditor = resolved.association?.editor;
  if (associationEditor != null) {
    return DEFAULT_EDITOR_IDS_BY_ASSOCIATION[associationEditor];
  }
  return DEFAULT_EDITOR_IDS_BY_EXT[ext];
}

function resolve_candidate(
  candidates: FileEditorSpec[] | undefined,
  fileKey: string,
  editorId?: string,
  projectEditorId?: string,
  defaultEditorId?: string,
): FileEditorSpec | undefined {
  if (candidates == null || candidates.length === 0) {
    return;
  }
  const extensionResolution = extensionRegistry.resolveEditor(
    extensionRegistry.getEditorCandidatesForFileKey(fileKey),
    {
      editorId,
      projectEditorId,
      builtinEditorId: defaultEditorId,
    },
  );
  if (extensionResolution != null && extensionResolution.reason !== "latest") {
    const extensionCandidate = candidates.find(
      (candidate) =>
        candidate.id === extensionResolution.extension.definition.id,
    );
    if (extensionCandidate != null) {
      return extensionCandidate;
    }
  }
  if (editorId != null) {
    const remembered = candidates.find(
      (candidate) => candidate.id === editorId,
    );
    if (remembered != null) {
      return remembered;
    }
  }
  if (defaultEditorId != null) {
    const builtin = candidates.find(
      (candidate) => candidate.id === defaultEditorId,
    );
    if (builtin != null) {
      return builtin;
    }
  }
  return candidates[candidates.length - 1];
}

// Get editor for given path.

function get_ed(
  project_id: string | undefined,
  path: string,
  ext?: string,
  editorId?: string,
): FileEditorSpec {
  const rememberedEditorId = editorId ?? altEditorId[key(project_id, path)];
  if (rememberedEditorId != null) {
    const editor = file_editors_by_id[rememberedEditorId];
    if (editor != null) {
      return editor;
    }
  }

  ext =
    ext ??
    altExt[key(project_id, path)] ??
    filename_extension(path).toLowerCase();
  const defaultEditorId = builtin_default_editor_id(path, ext);

  const resolved = resolve_file_type(path, ext);
  const projectEditorId =
    getProjectEditorId(project_id, resolved.key) ??
    getProjectEditorId(project_id, resolved.ext);
  const exact =
    resolved.key !== resolved.ext
      ? resolve_candidate(
          file_editors[resolved.key],
          resolved.key,
          editorId,
          projectEditorId,
          defaultEditorId,
        )
      : undefined;
  if (exact != null) {
    return exact;
  }

  let spec = resolve_candidate(
    file_editors[resolved.ext],
    resolved.ext,
    editorId,
    projectEditorId,
    defaultEditorId,
  );
  if (spec == null) {
    // Log when falling back to unknown editor
    logFallback(ext, path);
    spec = resolve_candidate(file_editors[""], "", editorId, projectEditorId);
  }
  if (spec == null) {
    // This happens if the editors haven't been loaded yet.  A valid use
    // case is you open a project and session restore creates one *background*
    // file tab, which you then close (without ever looking at the file).
    return {};
  }
  return spec;
}

// Performs things that need to happen before render
// Calls file_editors[ext].init()
// Examples of things that go here:
// - Initializing store state
// - Initializing Actions
export async function initializeAsync(
  path: string,
  redux,
  project_id: string | undefined,
  content?: string,
  ext?: string,
  editorId?: string,
): Promise<string | undefined> {
  altExt[key(project_id, path)] = ext;
  altEditorId[key(project_id, path)] = editorId;
  const editor = get_ed(project_id, path, ext, editorId);
  if (editor.init != null) {
    return editor.init(path, redux, project_id, content);
  }
  if (editor.initAsync != null) {
    try {
      return await editor.initAsync(path, redux, project_id, content);
    } catch (err) {
      console.error(`Failed to initialize async editor for ${path}: ${err}`);
      // Single point where all async editor load errors are reported to user
      alert_message({
        type: "error",
        title: "Editor Load Failed",
        message: `Failed to load editor for ${path}: ${err}. Please check your internet connection and refresh the page.`,
        timeout: 10,
      });
      throw err;
    }
  }
}

export function initialize(
  path: string,
  redux,
  project_id: string | undefined,
  content?: string,
  ext?: string,
  editorId?: string,
): string | undefined {
  altExt[key(project_id, path)] = ext;
  altEditorId[key(project_id, path)] = editorId;
  const editor = get_ed(project_id, path, ext, editorId);
  if (editor.init == null) {
    throw Error(`sync initialize not supported for ${path}`);
  }
  return editor.init(path, redux, project_id, content);
}

// This altExt gets used in the future if nothing is specified.
// This makes it so we don't have to explicitly specify ext
// for other functions like initialize and remove.
const key = (project_id, path) => `${project_id}-${path}`;
const altExt: { [project_id_path: string]: string | undefined } = {};
const altEditorId: { [project_id_path: string]: string | undefined } = {};

export function resolve_editor_id(
  path: string,
  project_id: string | undefined,
  ext?: string,
  editorId?: string,
): string | undefined {
  return get_ed(project_id, path, ext, editorId)?.id;
}

// Returns an editor instance for the path
export async function generateAsync(
  path: string,
  redux,
  project_id: string | undefined,
  ext?: string, // use instead of path ext
  editorId?: string,
) {
  altExt[key(project_id, path)] = ext;
  altEditorId[key(project_id, path)] = editorId;
  const e = get_ed(project_id, path, ext, editorId);
  const { generator } = e;
  if (generator != null) {
    return generator(path, redux, project_id);
  }
  const { component, componentAsync } = e;
  if (component == null) {
    if (componentAsync != null) {
      try {
        return await componentAsync();
      } catch (err) {
        const error = err as Error;
        console.error(`Failed to load editor component for ${path}: ${error}`);
        // Single point where all async editor load errors are reported to user
        alert_message({
          type: "error",
          title: "Editor Load Failed",
          message: `Failed to load editor for ${path}: ${error}. Please check your internet connection and refresh the page.`,
          timeout: 10,
        });
        // Return error component with refresh button
        return () => React.createElement(EditorLoadError, { path, error });
      }
    }
    return () =>
      React.createElement(
        "div",
        `No editor for ${path} or fallback editor yet`,
      );
  }
  return component;
}

// Actually remove the given editor
export async function remove(
  path: string,
  redux,
  project_id: string | undefined,
): Promise<void> {
  if (path == null) {
    return; // TODO: remove when all typescript
  }
  if (typeof path !== "string") {
    // TODO: remove when all typescript
    console.warn(
      `BUG -- remove called on path of type '${typeof path}'`,
      path,
      project_id,
    );
    // see https://github.com/sagemathinc/cocalc/issues/1275
    return;
  }

  const isPublicGroup =
    project_id != null &&
    redux.getProjectsStore?.().get_my_group(project_id) === "public";

  if (!isPublicGroup && project_id != null) {
    // always fire off a save to disk when closing.
    save(path, redux, project_id);
  }

  if (!isPublicGroup) {
    // Also free the corresponding side chat, if it was created.
    require("./chat/register").remove(
      meta_file(path, "chat"),
      redux,
      project_id,
    );
  }

  const editorKey = key(project_id, path);
  const e = get_ed(project_id, path);
  // Wait until the next render cycle before actually removing,
  // to give the UI a chance to save some state (e.g., scroll positions).
  await delay(0);

  if (typeof e.remove === "function") {
    e.remove(path, redux, project_id);
  }
  delete altExt[editorKey];
  delete altEditorId[editorKey];
}

// The save function may be called to request to save contents to disk.
// It does not take a callback.  It's a non-op if no save function is registered
// or the file isn't open.
export function save(path: string, redux, project_id: string): void {
  if (path == null) {
    console.warn("WARNING: save(undefined path)"); // TODO: remove when all typescript
    return;
  }
  if (redux.getProjectsStore?.().get_my_group(project_id) === "public") {
    return;
  }
  const save = get_ed(project_id, path).save;
  if (save != null) {
    save(path, redux, project_id);
  }
}

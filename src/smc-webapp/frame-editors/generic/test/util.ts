/*
Testing framework for editors.
*/

import { expect as expect0 } from "chai";

export let expect = expect0;
(window as any).expect = expect;

import { redux } from "../react";

// hardcode for now... until we see how this is going to work.
const default_project_id: string = "98e85b9b-51bb-4889-be47-f42698c37ed4";

import { delay } from "awaiting";
import { uuid } from "../../generic/misc";
import { callback_opts } from "../../generic/async-utils";
import { read_text_file_from_project } from "../../generic/client";

interface ReduxData {
  actions: any;
  store: any;
}

export interface FileTestData {
  project_id: string;
  path: string;
  redux: {
    project: ReduxData;
    editor: ReduxData;
  };
}

function exists(x: any, desc: string): void {
  if (!x) {
    throw Error(`object must be defined -- ${desc}`);
  }
}

function open_file(project_id: string, path: string): FileTestData {
  //console.log(`open_file("${project_id}","${path}")`);
  const data: FileTestData = {
    redux: {
      project: {} as ReduxData,
      editor: {} as ReduxData
    },
    project_id: project_id,
    path: path
  };
  const projects = redux.getActions("projects");
  if (!projects) {
    throw Error(
      "projects redux store MUST be initialized before using test utils open_file"
    );
  }
  projects.open_project({ project_id: project_id });
  exists(
    (data.redux.project.actions = redux.getProjectActions(project_id)),
    "project actions"
  );
  exists(
    (data.redux.project.store = redux.getProjectStore(project_id)),
    "project store"
  );
  data.redux.project.actions.open_file({ path: path });
  exists(
    (data.redux.editor.actions = redux.getEditorActions(project_id, path)),
    "editor actions"
  );
  exists(
    (data.redux.editor.store = redux.getEditorStore(project_id, path)),
    "editor store"
  );
  return data;
}

function delete_file(project_id: string, path: string): void {
  redux.getProjectActions(project_id).delete_files({ paths: [path] });
}

/* Return test data for a random file with the given extension in some project */
function get_editor(extension: string): FileTestData {
  return open_file(
    default_project_id,
    `test/${uuid().slice(0, 8)}.${extension}`
  );
}

function delete_editor(data: FileTestData): void {
  delete_file(data.project_id, data.path);
}

export const describe: Function = (window as any).describe;
export const it: Function = (window as any).it;
export const before: Function = (window as any).before;
export const after: Function = (window as any).after;
export const beforeEach: Function = (window as any).beforeEach;
export const afterEach: Function = (window as any).afterEach;

export interface Editor {
  data: FileTestData;
  delete(): void;
  wait_until_loaded(): Promise<void>;
  read_file_from_disk(): Promise<string>;
}

export class TestEditor implements Editor {
  public data: FileTestData;
  public actions: any;
  public store: any;
  constructor(public extension: string) {
    this.data = get_editor(extension);
    /* direct access to actions/store, since these are used so much in testing */
    this.actions = this.data.redux.editor.actions;
    this.store = this.data.redux.editor.store;
    (window as any).editor = this;
  }
  delete(): void {
    delete_editor(this.data);
  }
  async wait_until_loaded(): Promise<void> {
    await callback_opts(this.data.redux.editor.store.wait)({
      until: s => s.get("is_loaded")
    });
  }
  async wait_until_store(until: Function): Promise<void> {
    await callback_opts(this.store.wait)({
      until: until
    });
  }
  async read_file_from_disk(): Promise<string> {
    return await read_text_file_from_project({
      project_id: this.data.project_id,
      path: this.data.path
    });
  }
}

// Make accessible for interactive work...
(window as any).test_editor = function(extension: string) {
  return new TestEditor(extension);
};

export async function eventually(
  f: Function,
  maxtime_ms: number,
  note: string
) {
  const interval = 150;
  for (let i = 0; i < maxtime_ms / interval; i++) {
    try {
      f();
      return;
    } catch (err) {
      await delay(interval);
    }
  }
  throw Error(`timeout -- ${note}`);
}

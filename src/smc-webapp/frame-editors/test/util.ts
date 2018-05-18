import { redux } from "../generic/react";

interface ReduxData {
  actions: any;
  store: any;
}

export interface TestData {
  project: ReduxData;
  editor: ReduxData;
}

export function init(project_id: string, path: string): TestData {
  const data: TestData = { project: {} as ReduxData, editor: {} as ReduxData };
  data.project.actions = redux.getProjectActions(project_id);
  data.project.store = redux.getProjectStore(project_id);
  data.project.actions.open_file({ path: path });
  data.editor.actions = redux.getEditorActions(project_id, path);
  data.editor.store = redux.getEditorStore(project_id, path);
  (window as any).test_data = data;
  return data;
}

export function clean_up(project_id: string, path: string): void {
  redux.getProjectActions(project_id).delete_files({ paths: [path] });
}

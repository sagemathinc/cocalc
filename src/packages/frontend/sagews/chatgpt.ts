import { MARKERS } from "@cocalc/util/sagews";
import { redux } from "@cocalc/frontend/app-framework";
import { getHelp } from "@cocalc/frontend/frame-editors/chatgpt/help-me-fix";

export function isEnabled(project_id: string): boolean {
  return redux.getStore("projects").hasOpenAI(project_id, "help-me-fix");
}
export function helpMeFix({
  codemirror,
  stderr,
  uuid,
  project_id,
  path,
}): void {
  const val = codemirror.getValue();
  const i = val.indexOf(uuid);
  if (i == -1) return;
  const j = val.lastIndexOf(MARKERS.cell, i);
  const k = val.lastIndexOf(MARKERS.output, i);
  const input = val.slice(j + 1, k).trim();
  getHelp({
    project_id,
    path,
    tag: "sagews",
    error: stderr,
    input,
    task: "ran a cell in a Sage Worksheet",
    language: "sage",
    extraFileInfo: "SageMath Worksheet",
    redux,
    prioritizeLastInput: true,
    model: "gpt-3.5-turbo",
  });
}

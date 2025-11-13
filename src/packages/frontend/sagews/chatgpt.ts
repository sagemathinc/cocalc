import { redux } from "@cocalc/frontend/app-framework";
import { getHelp } from "@cocalc/frontend/frame-editors/llm/help-me-fix";
import { getValidLanguageModelName } from "@cocalc/util/db-schema/llm-utils";
import { MARKERS } from "@cocalc/util/sagews";
import { SETTINGS_LANGUAGE_MODEL_KEY } from "../account/useLanguageModelSetting";

export function isEnabled(project_id: string): boolean {
  return redux
    .getStore("projects")
    .hasLanguageModelEnabled(project_id, "help-me-fix-solution");
}

export function isHintEnabled(project_id: string): boolean {
  return redux
    .getStore("projects")
    .hasLanguageModelEnabled(project_id, "help-me-fix-hint");
}

interface HelpParams {
  codemirror: any;
  stderr: string;
  uuid: string;
  project_id: string;
  path: string;
}

function getHelpCommon(params: HelpParams, isHint: boolean): void {
  const { codemirror, stderr, uuid, project_id, path } = params;

  // Show confirmation dialog
  const action = isHint ? "get a hint" : "get help to fix this error";
  const confirmMessage = `This will query a language model to ${action}. The error message and your code will be sent to the AI service for analysis. Do you want to continue?`;

  if (!window.confirm(confirmMessage)) {
    return; // User cancelled
  }

  const val = codemirror.getValue();
  const i = val.indexOf(uuid);
  if (i == -1) return;
  const j = val.lastIndexOf(MARKERS.cell, i);
  const k = val.lastIndexOf(MARKERS.output, i);
  const input = val.slice(j + 1, k).trim();

  // use the currently set language model from the account store
  // https://github.com/sagemathinc/cocalc/pull/7278
  const other_settings = redux.getStore("account").get("other_settings");

  const projectsStore = redux.getStore("projects");
  const enabled = projectsStore.whichLLMareEnabled();
  const ollama = redux.getStore("customize").get("ollama")?.toJS() ?? {};
  const customOpenAI =
    redux.getStore("customize").get("custom_openai")?.toJS() ?? {};
  const selectableLLMs =
    redux.getStore("customize").get("selectable_llms")?.toJS() ?? [];

  const model = getValidLanguageModelName({
    model: other_settings?.get(SETTINGS_LANGUAGE_MODEL_KEY),
    filter: enabled,
    ollama: Object.keys(ollama),
    custom_openai: Object.keys(customOpenAI),
    selectable_llms: selectableLLMs,
  });

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
    prioritize: "end",
    model,
    isHint,
  });
}

export function helpMeFix(params: HelpParams): void {
  getHelpCommon(params, false);
}

export function giveMeAHint(params: HelpParams): void {
  getHelpCommon(params, true);
}

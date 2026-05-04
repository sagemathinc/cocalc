/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getChatActions from "@cocalc/frontend/chat/get-actions";
import { uuid } from "@cocalc/util/misc";

export interface AssistantSeed {
  id: string;
  prompt: string;
  forceNewTurn?: boolean;
  mode?: "hint";
  /** When true, pre-fill the input without auto-submitting. */
  prefill?: boolean;
  /**
   * When true, append `prompt` to the existing input (with a leading space if
   * the input is non-empty) instead of replacing it. Does not auto-submit.
   * Used for "insert a cell reference" style interactions.
   */
  insert?: boolean;
  /** If set, switch the agent to this model before processing. */
  model?: string;
}

export function normalizeAssistantSeed(raw: any): AssistantSeed | undefined {
  const value = raw?.toJS?.() ?? raw;
  if (!value || typeof value !== "object") return;
  if (typeof value.id !== "string" || typeof value.prompt !== "string") return;
  return {
    id: value.id,
    prompt: value.prompt,
    forceNewTurn:
      typeof value.forceNewTurn === "boolean" ? value.forceNewTurn : undefined,
    mode: value.mode === "hint" ? "hint" : undefined,
    prefill: value.prefill === true ? true : undefined,
    insert: value.insert === true ? true : undefined,
    model: typeof value.model === "string" ? value.model : undefined,
  };
}

export async function openAssistantWithSeed({
  redux,
  project_id,
  path,
  prompt,
  mode,
  model,
}: {
  redux: any;
  project_id: string;
  path: string;
  prompt: string;
  mode?: "hint";
  model?: string;
}): Promise<void> {
  await getChatActions(redux, project_id, path, 10, 0.7, "assistant");
  const editorActions = redux.getEditorActions(project_id, path) as any;
  const chatFrameId =
    editorActions?._get_most_recent_active_frame_id_of_type?.("chat");
  if (chatFrameId == null) {
    throw Error("unable to open assistant side chat");
  }
  editorActions.set_frame_tree({
    id: chatFrameId,
    chat_mode: "assistant",
    assistant_seed: {
      id: uuid(),
      prompt,
      forceNewTurn: true,
      mode,
      model,
    },
  });
  editorActions.set_active_id?.(chatFrameId);
}

/**
 * Open the assistant panel and pre-fill the input without auto-submitting.
 * The user can then edit the prompt and send it themselves.
 */
export async function openAssistantWithPrefill({
  redux,
  project_id,
  path,
  prompt,
}: {
  redux: any;
  project_id: string;
  path: string;
  prompt: string;
}): Promise<void> {
  await getChatActions(redux, project_id, path, 10, 0.7, "assistant");
  const editorActions = redux.getEditorActions(project_id, path) as any;
  const chatFrameId =
    editorActions?._get_most_recent_active_frame_id_of_type?.("chat");
  if (chatFrameId == null) {
    throw Error("unable to open assistant side chat");
  }
  editorActions.set_frame_tree({
    id: chatFrameId,
    chat_mode: "assistant",
    assistant_seed: {
      id: uuid(),
      prompt,
      prefill: true,
    },
  });
  editorActions.set_active_id?.(chatFrameId);
}

/**
 * Open the assistant panel and append text to the current input (with a
 * leading space if the input is non-empty). Used e.g. to insert a cell
 * reference like "#5" when the user clicks a cell index.
 */
export async function openAssistantAndInsert({
  redux,
  project_id,
  path,
  text,
}: {
  redux: any;
  project_id: string;
  path: string;
  text: string;
}): Promise<void> {
  await getChatActions(redux, project_id, path, 10, 0.7, "assistant");
  const editorActions = redux.getEditorActions(project_id, path) as any;
  const chatFrameId =
    editorActions?._get_most_recent_active_frame_id_of_type?.("chat");
  if (chatFrameId == null) {
    throw Error("unable to open assistant side chat");
  }
  editorActions.set_frame_tree({
    id: chatFrameId,
    chat_mode: "assistant",
    assistant_seed: {
      id: uuid(),
      prompt: text,
      insert: true,
    },
  });
  editorActions.set_active_id?.(chatFrameId);
}

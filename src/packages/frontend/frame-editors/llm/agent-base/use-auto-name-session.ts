/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Shared hook for auto-naming an agent session (turn) via LLM.
Uses a free model on cocalc.com when available to avoid charging
the user for a trivial naming call.
*/

import { useCallback } from "react";

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  getOneFreeModel,
  isFreeModel,
} from "@cocalc/util/db-schema/llm-utils";

import type { AgentSession } from "./types";

interface UseAutoNameSessionOpts {
  session: AgentSession;
  model: string;
  project_id: string;
  tag: string;
}

export function useAutoNameSession({
  session,
  model,
  project_id,
  tag,
}: UseAutoNameSessionOpts) {
  const isCoCalcCom = useTypedRedux("customize", "is_cocalc_com");

  return useCallback(async () => {
    const sid = session.sessionId;
    if (!sid || session.messages.length === 0) return;
    try {
      // Gather the first ~1000 characters from user + assistant messages
      let context = "";
      for (const msg of session.messages) {
        if (msg.sender === "user" || msg.sender === "assistant") {
          context += `${msg.sender === "user" ? "User" : "Assistant"}: ${msg.content}\n\n`;
          if (context.length >= 1000) break;
        }
      }
      context = context.slice(0, 1000);

      // Use a free model on cocalc.com to avoid charging the user for
      // naming; fall back to their selected model if none is available.
      const freeModel = isCoCalcCom ? getOneFreeModel() : undefined;
      const nameModel =
        freeModel && isFreeModel(freeModel, isCoCalcCom) ? freeModel : model;
      const stream = webapp_client.openai_client.queryStream({
        input: `Given this conversation between a user and an AI assistant, generate a very short descriptive title (at most 7 words). Reply with ONLY the title, no quotes, no punctuation at the end.\n\n${context}`,
        system:
          "You generate short descriptive titles for conversations. Reply with only the title.",
        history: [],
        model: nameModel,
        project_id,
        tag: `${tag}:auto-name`,
      });
      let title = "";
      stream.on("token", (token: string | null) => {
        if (token != null) {
          title += token;
        } else {
          const trimmed = title.trim().slice(0, 80);
          if (trimmed) {
            session.writeSessionName(trimmed, sid);
          }
        }
      });
      stream.on("error", () => {});
    } catch {
      // Silently ignore — naming is best-effort
    }
  }, [
    isCoCalcCom,
    model,
    project_id,
    session.sessionId,
    session.messages,
    session.writeSessionName,
  ]);
}

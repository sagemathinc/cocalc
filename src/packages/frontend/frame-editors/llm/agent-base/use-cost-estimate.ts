/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Shared cost-estimation hook for agent panels (coding-agent, agent-editor,
notebook-agent, etc.).

Debounces token counting by 500ms, dynamically imports numTokensEstimate
for code-splitting, and short-circuits for free models.
*/

import { useCallback, useRef, useState } from "react";

import { calcMinMaxEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import { isFreeModel } from "@cocalc/util/db-schema/llm-utils";
import type { CostEstimate } from "@cocalc/frontend/chat/types";
import type { DisplayMessage } from "./types";

const ESTIMATE_DEBOUNCE_MS = 500;

interface UseCostEstimateParams {
  model: string;
  isCoCalcCom: boolean;
  llm_markup: number;
  messages: DisplayMessage[];
}

/**
 * Provides debounced LLM cost estimation state for agent input areas.
 *
 * Returns:
 * - `costEstimate` — the current min/max cost estimate (or null)
 * - `updateEstimate(inputText)` — call on every input change
 * - `clearEstimate()` — reset estimate and cancel pending timer
 * - `estimateTimeoutRef` — exposed for unmount cleanup in callers
 *   that already have a cleanup effect (avoids double-timer bugs)
 */
export function useCostEstimate({
  model,
  isCoCalcCom,
  llm_markup,
  messages,
}: UseCostEstimateParams) {
  const [costEstimate, setCostEstimate] = useState<CostEstimate>(null);
  const estimateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearEstimate = useCallback(() => {
    if (estimateTimeoutRef.current) {
      clearTimeout(estimateTimeoutRef.current);
      estimateTimeoutRef.current = null;
    }
    setCostEstimate(null);
  }, []);

  const updateEstimate = useCallback(
    (inputText: string) => {
      if (estimateTimeoutRef.current) {
        clearTimeout(estimateTimeoutRef.current);
      }
      if (!inputText?.trim()) {
        setCostEstimate(null);
        return;
      }
      estimateTimeoutRef.current = setTimeout(async () => {
        if (!model) {
          setCostEstimate(null);
          return;
        }
        if (isFreeModel(model, isCoCalcCom)) {
          setCostEstimate({ min: 0, max: 0 });
          return;
        }
        try {
          const { numTokensEstimate } = await import(
            "@cocalc/frontend/misc/llm"
          );
          const historyText = messages
            .filter((m) => m.event === "message")
            .map((m) => m.content)
            .join("\n");
          const tokens = numTokensEstimate(
            [historyText, inputText].join("\n"),
          );
          setCostEstimate(calcMinMaxEstimation(tokens, model, llm_markup));
        } catch {
          // Unknown model or cost lookup failure — skip estimation
          setCostEstimate(null);
        }
      }, ESTIMATE_DEBOUNCE_MS);
    },
    [model, isCoCalcCom, llm_markup, messages],
  );

  return { costEstimate, updateEstimate, clearEstimate, estimateTimeoutRef };
}

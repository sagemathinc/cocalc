/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Shared header bar for agent panels: AI avatar, title, and model selector.
*/

import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import LLMSelector from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { COLORS } from "@cocalc/util/theme";

interface AgentHeaderProps {
  title: string;
  model: string;
  setModel: (model: string) => void;
  project_id: string;
}

export function AgentHeader({
  title,
  model,
  setModel,
  project_id,
}: AgentHeaderProps) {
  return (
    <div
      style={{
        padding: "6px 12px",
        borderBottom: `1px solid ${COLORS.GRAY_L}`,
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <AIAvatar size={20} />
      <span style={{ fontWeight: 500 }}>{title}</span>
      <div style={{ flex: 1 }} />
      <LLMSelector
        model={model}
        setModel={setModel}
        project_id={project_id}
        size="small"
        narrow
      />
    </div>
  );
}

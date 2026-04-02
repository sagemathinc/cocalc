/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Shared header bar for agent panels: AI avatar, title, model selector,
and optional help popover.
*/

import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { HelpIcon } from "@cocalc/frontend/components";
import LLMSelector from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { COLORS } from "@cocalc/util/theme";

interface AgentHeaderProps {
  title: string;
  model: string;
  setModel: (model: string) => void;
  project_id: string;
  /** Optional help content shown as a ? icon next to the title. */
  helpContent?: React.ReactNode;
}

export function AgentHeader({
  title,
  model,
  setModel,
  project_id,
  helpContent,
}: AgentHeaderProps) {
  return (
    <div
      style={{
        flex: "0 0 auto",
        padding: "6px 12px",
        borderBottom: `1px solid var(--cocalc-border, ${COLORS.GRAY_L})`,
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <AIAvatar size={20} />
      <span style={{ fontWeight: 500 }}>{title}</span>
      {helpContent != null && (
        <HelpIcon title={title} maxWidth="350px">
          {helpContent}
        </HelpIcon>
      )}
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

/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { COLORS } from "@cocalc/util/theme";
import Info from "components/landing/info";
import { CSS } from "components/misc";
import A from "components/misc/A";
import SanitizedMarkdown from "components/misc/sanitized-markdown";

const A_STYLE: CSS = {
  color: "#ddd",
  backgroundColor: "transparent",
} as const;

export function Tagline({ value, style }: { value?: string; style? }) {
  function renderContent() {
    if (value) {
      return (
        <div style={{ margin: "5px 0 -15px 0" }}>
          <SanitizedMarkdown value={value} anchorStyle={A_STYLE} />
        </div>
      );
    } else {
      return (
        <div style={{ margin: "5px 0 5px 0" }}>
          CoCalc Runs Your{" "}
          <A href="/features/jupyter-notebook" style={A_STYLE}>
            Jupyter Notebooks
          </A>{" "}
          and{" "}
          <A href="/features/terminal" style={A_STYLE}>
            Linux Terminals
          </A>{" "}
          with powerful resources.
        </div>
      );
    }
  }

  return (
    <Info.Heading
      level={3}
      textStyle={{ color: "white" }}
      style={{
        backgroundColor: COLORS.BLUE_D,
        ...style,
      }}
    >
      {renderContent()}
    </Info.Heading>
  );
}

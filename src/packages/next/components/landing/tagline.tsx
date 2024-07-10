/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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
      return <SanitizedMarkdown value={value} anchorStyle={A_STYLE} />;
    } else {
      return (
        <>
          CoCalc Runs Your{" "}
          <A href="/features/jupyter-notebook" style={A_STYLE}>
            Jupyter Notebooks
          </A>{" "}
          and{" "}
          <A href="/features/terminal" style={A_STYLE}>
            Linux Terminals
          </A>{" "}
          using Powerful{" "}
          <A href="/features/compute-server" style={A_STYLE}>
            CPUs and GPUs
          </A>
          !
        </>
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

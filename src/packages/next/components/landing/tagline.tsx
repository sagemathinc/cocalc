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
  color: "white",
  backgroundColor: "transparent",
} as const;

export function Tagline({ value }: { value?: string }) {
  function renderContent() {
    if (value) {
      return <SanitizedMarkdown value={value} anchorStyle={A_STYLE} />;
    } else {
      return (
        <>
          Realtime collaborative{" "}
          <A href="/features/jupyter-notebook" style={A_STYLE}>
            Jupyter notebooks
          </A>
          ,{" "}
          <A href="/features/latex-editor" style={A_STYLE}>
            LaTeX
          </A>
          , Markdown, and Linux with GPUs
        </>
      );
    }
  }

  return (
    <Info.Heading
      level={2}
      textStyle={{ color: "white" }}
      style={{
        backgroundColor: COLORS.BLUE_D,
        paddingBottom: "30px",
        marginTop: "30px",
        paddingTop: "30px",
      }}
    >
      {renderContent()}
    </Info.Heading>
  );
}

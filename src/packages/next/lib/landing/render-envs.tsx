/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Typography } from "antd";
import React, { type JSX } from "react";

import A from "components/misc/A";
import { ExecInfo, SoftwareSpecEntry } from "./types";
import SanitizedMarkdown from "components/misc/sanitized-markdown";

const { Paragraph } = Typography;

export const VERSION_STYLE: React.CSSProperties = {
  maxHeight: "8em",
  whiteSpace: "pre-wrap",
  backgroundColor: "rgba(150, 150, 150, 0.1)",
  fontSize: "12px",
  padding: "10px",
  overflow: "auto",
  marginBottom: "20px",
} as const;

interface Props {
  spec: Record<string, SoftwareSpecEntry>;
  execInfo?: ExecInfo;
}

export function ExecutableDescription(props: Props) {
  const { spec, execInfo } = props;
  function renderEnvs() {
    const envs: JSX.Element[] = [];
    for (const [key, info] of Object.entries(spec)) {
      const version = execInfo?.[info.path];
      envs.push(
        <Paragraph key={key}>
          <dt>
            <A style={{ fontWeight: "bold" }} href={info.url}>
              {info.name}
            </A>
            :
          </dt>
          <dd style={{ marginBottom: "0.5rem" }}>
            <SanitizedMarkdown value={info.doc} />
            {version && <div style={VERSION_STYLE}>{version}</div>}
          </dd>
        </Paragraph>
      );
    }
    return envs;
  }

  return <dl>{renderEnvs()}</dl>;
}

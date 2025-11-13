/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Row, Col } from "antd";
import { ReactNode } from "react";

import A from "components/misc/A";
import Code from "./code";
import { CSS, Paragraph, Title } from "components/misc";
import { MAX_WIDTH_LANDING } from "lib/config";

export const STYLE_PITCH: CSS = {
  padding: "60px 15px",
  backgroundColor: "white",
} as const;

interface Props {
  col1: ReactNode;
  col2: ReactNode;
  ext?: string;
  style?: CSS;
  title?: ReactNode;
}

export default function Pitch(props: Props) {
  const { col1, col2, ext, style, title } = props;
  return (
    <div style={{ ...STYLE_PITCH, ...style }}>
      {title ? (
        <Title level={2} style={{ textAlign: "center", ...style }}>
          {title}
        </Title>
      ) : undefined}
      <Row
        gutter={20}
        style={{ maxWidth: MAX_WIDTH_LANDING, margin: "0 auto" }}
        align="top"
      >
        <Col lg={12}>{col1}</Col>
        <Col lg={12}>{col2}</Col>
      </Row>
      {ext && <CallToAction ext={ext} />}
    </div>
  );
}

const STYLE_CALL: CSS = {
  textAlign: "center",
  padding: "30px 0",
  fontSize: "14pt",
} as const;

function CallToAction(props: { ext: string }) {
  const { ext } = props;
  return (
    <Paragraph style={STYLE_CALL}>
      <strong>Ready out of the box</strong>:{" "}
      <A href="https://doc.cocalc.com/getting-started.html">
        Sign up, create a project
      </A>
      , create or <A href="https://doc.cocalc.com/howto/upload.html">upload</A>{" "}
      your {ext && <Code>*.{ext}</Code>} file, and you're ready to go!
    </Paragraph>
  );
}

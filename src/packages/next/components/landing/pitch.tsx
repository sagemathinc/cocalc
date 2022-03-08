import { Row, Col } from "antd";
import { ReactNode } from "react";
import A from "components/misc/A";
import Code from "./code";

interface Props {
  col1: ReactNode;
  col2: ReactNode;
  ext?: string;
}

export default function Pitch({ col1, col2, ext }: Props) {
  return (
    <div
      style={{
        padding: "30px 10%",
        backgroundColor: "white",
        fontSize: "11pt",
      }}
    >
      <Row>
        <Col lg={12} style={{ paddingRight: "20px" }}>
          {col1}
        </Col>
        <Col lg={12}>{col2}</Col>
      </Row>
      {ext && <CallToAction ext={ext} />}
    </div>
  );
}

function CallToAction({ ext }: { ext: string }) {
  return (
    <div style={{ textAlign: "center", padding: "30px 0", fontSize: "14pt" }}>
      <strong>Ready out of the box</strong>:{" "}
      <A href="https://doc.cocalc.com/getting-started.html">
        Sign up, create a project
      </A>
      , create or <A href="https://doc.cocalc.com/howto/upload.html">upload</A>{" "}
      your {ext && <Code>*.{ext}</Code>} file, and you're ready to go!
    </div>
  );
}

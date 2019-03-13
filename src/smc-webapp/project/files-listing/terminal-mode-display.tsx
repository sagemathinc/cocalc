import * as React from "react";
{Alert, Row, Col} = require("react-bootstrap")

const row_style: React.CSSProperties = {
  textAlign: "left",
  color: "#888",
  marginTop: "5px",
  wordWrap: "break-word"
};

const alert_style: React.CSSProperties = {
  marginTop: "5px",
  fontWeight: "bold"
};

export function TerminalModeDisplay() {
  return (
    <Row style={row_style}>
      <Col sm={2} />
      <Col sm={8}>
        <Alert style={alert_style} bsStyle="info">
          You are in{" "}
          <a
            target="_blank"
            href="https://github.com/sagemathinc/cocalc/wiki/File-Listing#terminal-mode"
          >
            terminal mode
          </a>
          .
        </Alert>
      </Col>
      <Col sm={2} />
    </Row>
  );
}

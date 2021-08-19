import React from "react";
import { HELP_EMAIL } from "@cocalc/util/theme";

export default function CrashMessage({
  msg,
  lineNo,
  columnNo,
  url,
  stack,
  showExplanation,
}) {
  return (
    <div>
      <div>
        <strong>Application Error:</strong>{" "}
        <code>
          {msg} @ {lineNo}/{columnNo} of {url}
        </code>
      </div>
      {showExplanation && (
        <div
          style={{
            border: "1px solid lightgrey",
            margin: "30px",
            padding: "15px",
            background: "lightyellow",
            borderRadius: "5px",
          }}
        >
          <h3>CoCalc Failed to Load</h3>
          Please report the full error, your browser and operating system to{" "}
          <a href={`mailto:${HELP_EMAIL}`}>{HELP_EMAIL}</a>. In the meantime,
          try switching to another browser or upating to the latest version of
          your browser.
        </div>
      )}
      <pre style={{ overflow: "auto", marginTop: "15px" }}>{stack}</pre>
    </div>
  );
}

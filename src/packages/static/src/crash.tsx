import React from "react";
import { HELP_EMAIL } from "@cocalc/util/theme";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";
import A from "./link";

const STYLE = {
  display: "none",
  zIndex: 10000,
  position: "absolute",
  overflow: "scroll",
  height: "90vh",
  width: "80vw",
  top: "5vh",
  left: "10vw",
  border: "5px solid #dc3545",
  padding: "10px 20px 20px 20px",
  borderRadius: "5px",
  fontSize: "12pt",
  background: "white",
} as React.CSSProperties;

export default function Crash() {
  return (
    <div id="cocalc-react-crash" style={STYLE}>
      <h1>
        <i className="fa fa-robot">&nbsp;</i> CoCalc Crashed
      </h1>

      <div>
        <p>
          Sorry to interrupt your work. An error happened in CoCalc's web
          application. Don't worry, all your files are securely stored on its
          servers!
        </p>

        <p style={{ fontWeight: "bold", fontSize: "115%" }}>
          Please{" "}
          <a onClick={() => window.location.reload()}>
            reload this browser tab
          </a>{" "}
          in order to recover from this.
        </p>

        <p style={{ fontWeight: "bold", fontSize: "115%" }}>
          You may also{" "}
          <a
            onClick={() => {
              // Yes, this is a very non-react way to do this.  This is a
              // port of something else that didn't use React.
              const crash = document.getElementById("cocalc-react-crash");
              if (crash == null) return;
              crash.style.display = "none";
            }}
          >
            hide this error
          </a>{" "}
          and continue using CoCalc.
        </p>

        <p>
          If this happens repeatedly for a specific file or action, please
          report all details to{" "}
          <A href={`mailto:${HELP_EMAIL}`}>{HELP_EMAIL}</A>, or consult our{" "}
          <A href={join(appBasePath, "info")}>other support resources</A>. Thank
          you!
        </p>
      </div>

      <div id="cocalc-error-report-react"></div>

      <div id="cocalc-error-report-startup"></div>
    </div>
  );
}

import { HELP_EMAIL } from "@cocalc/util/theme";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";
import A from "./link";
import supportURL from "@cocalc/frontend/support/url";

const STYLE = {
  display: "none",
  zIndex: 10000,
  position: "absolute",
  overflow: "scroll",
  height: "90vh",
  width: "70vw",
  top: "5vh",
  left: "15vw",
  border: "1px solid #dc3545",
  padding: "20px",
  borderRadius: "5px",
  fontSize: "12pt",
  backgroundColor: "#fafafa",
  color: "#444",
} as React.CSSProperties;

export default function Crash() {
  const getSupport = supportURL({
    subject: "Crash Crashed",
    body: "CoCalc is crashing...",
    type: "question",
    hideExtra: true,
  });
  return (
    <div id="cocalc-react-crash" style={STYLE}>
      <h1 style={{ textAlign: "center" }}>
        <i className="fa fa-robot">&nbsp;</i> CoCalc Crashed
      </h1>

      <hr />

      <div>
        <p>
          Sorry to interrupt your work. An error happened in CoCalc's web
          application. Don't worry, all your files are securely stored on its
          servers!
        </p>

        <ul>
          <li>
            <p style={{ fontWeight: "bold", fontSize: "115%" }}>
              <a onClick={() => window.location.reload()}>
                Reload this browser tab
              </a>{" "}
              in order to recover from this. You might also try{" "}
              <a
                href={join(
                  appBasePath,
                  `projects?session=${new Date().valueOf()}`
                )}
              >
                a new session
              </a>
              .
            </p>
          </li>

          <li>
            <p style={{ fontWeight: "bold", fontSize: "115%" }}>
              <a
                onClick={() => {
                  // Yes, this is a very non-react way to do this.  This is a
                  // port of something else that didn't use React.
                  const crash = document.getElementById("cocalc-react-crash");
                  if (crash == null) return;
                  crash.style.display = "none";
                }}
              >
                Dismiss this error
              </a>{" "}
              and continue using CoCalc.
            </p>
          </li>
        </ul>
      </div>

      <hr />

      <div id="cocalc-error-report-react"></div>

      <div id="cocalc-error-report-startup"></div>

      <p>
        If this happens repeatedly for a specific file or action, please report
        all details in <A href={getSupport}>a support ticket</A>, via email to{" "}
        <A href={`mailto:${HELP_EMAIL}`}>{HELP_EMAIL}</A>, or consult our{" "}
        <A href={join(appBasePath, "info")}>other support resources</A>. Thank
        you!
      </p>
    </div>
  );
}

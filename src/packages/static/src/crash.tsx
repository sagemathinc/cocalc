/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { join } from "path";

import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import supportURL from "@cocalc/frontend/support/url";
import { COLORS, HELP_EMAIL } from "@cocalc/util/theme";
import A from "./link";

const STYLE: React.CSSProperties = {
  display: "none",
  zIndex: 10000,
  position: "absolute",
  overflow: "scroll",
  height: "90vh",
  width: "60vw",
  top: "5vh",
  left: "20vw",
  border: "1px solid #aaaaaa",
  boxShadow: "10px 10px 10px lightgrey",
  padding: "30px",
  borderRadius: "5px",
  fontSize: "12pt",
  backgroundColor: "white",
  color: COLORS.GRAY_D,
} as const;

export default function Crash() {
  const getSupport = supportURL({
    subject: "CoCalc Crashed",
    body: "CoCalc is crashing...",
    type: "problem",
    hideExtra: true,
  });

  function dismiss() {
    // Yes, this is a very non-react way to do this.  This is a
    // port of something else that didn't use React.
    const crash = document.getElementById("cocalc-react-crash");
    if (crash == null) return;
    crash.style.display = "none";
  }

  return (
    <div id="cocalc-react-crash" style={STYLE}>
      <h1
        style={{
          textAlign: "center",
          color: "white",
          background: "crimson",
          padding: "15px",
          borderRadius: "5px",
        }}
      >
        &nbsp; CoCalc Crashed
        <a onClick={dismiss} style={{ float: "right", color: "white" }}>
          ×
        </a>
      </h1>

      <div style={{ fontWeight: "bold", textAlign: "center" }}>
        Sorry to interrupt your work. An error happened in CoCalc's web
        application.
        <br />
        Don't worry, your CoCalc files are securely stored on our servers!
      </div>

      <hr />

      <p>
        <strong>Browser outdated?</strong> Please check if your{" "}
        <A
          style={{ fontWeight: "bold" }}
          href={"https://www.whatismybrowser.com/"}
        >
          browser is up to date
        </A>
        . CoCalc requires running a recent version of a modern browser.
      </p>

      <p>
        <strong>Extensions/AdBlocker?</strong> If you have any{" "}
        <strong>browser extensions</strong> enabled, they can break CoCalc and
        there is nothing we can do about it. You may want to try CoCalc in
        incognito mode or otherwise try disabling browser extensions to see if
        your ad blocker (or grammar checker, etc.) is breaking CoCalc.
      </p>

      <ul>
        <li>
          <p style={{ fontWeight: "bold", fontSize: "115%" }}>
            <a onClick={() => window.location.reload()}>
              Reload this browser tab
            </a>{" "}
            in order to recover from this. You might also try{" "}
            <a href={join(appBasePath, `projects?session=${Date.now()}`)}>
              a new session
            </a>
            .
          </p>
        </li>

        <li>
          <p style={{ fontWeight: "bold", fontSize: "115%" }}>
            <a onClick={dismiss}>Dismiss this error</a> and continue using
            CoCalc.
          </p>
        </li>
      </ul>

      <hr />

      <div id="cocalc-error-report-react"></div>

      <div id="cocalc-error-report-startup"></div>

      <hr />

      <div>
        If this happens repeatedly for a specific file or action, please report
        all details in <A href={getSupport}>a support ticket</A>, via email to{" "}
        <A href={`mailto:${HELP_EMAIL}`}>{HELP_EMAIL}</A>, or consult our{" "}
        <A href={join(appBasePath, "info")}>other support resources</A>. Thank
        you! Unfortunately, if you don't explain how you hit this problem so we
        can reproduce it, then we probably will not be able to fix it.
      </div>
    </div>
  );
}

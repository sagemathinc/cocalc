/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";

/*
ES6 support https://www.w3schools.com/js/js_versions.asp
Firefox: 54
Edge: 14
Safari: 10
Opera: 55
Chrome is wrong on that page, I assume we should check for 61 or 62.
*/

const APP_NAME = "CoCalc";

const A: React.FC<{ href: string; children }> = ({ href, children }) => (
  <a
    href={href}
    target={"_blank"}
    rel={"noopener"}
    style={{ textDecoration: "none" }}
  >
    {children}
  </a>
);

interface Spec {
  name: string;
  version: number;
  /* buildID: string for FF, first 8 digits are a date-timestamp; int-quadruple for chrome */
  buildID: string | number[] | undefined;
}

/* credits: https://stackoverflow.com/a/38080051/54236 */
function getSpec(): Spec {
  const mstr = /(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i;
  const ua = navigator.userAgent;
  let tem: RegExpMatchArray | null;
  let M = ua.match(mstr) || [];
  if (/trident/i.test(M[1])) {
    tem = /\brv[ :]+(\d+)/g.exec(ua) || [];
    return { name: "IE", version: parseInt(tem[1]) || NaN, buildID: "" };
  }
  if (M[1] === "Chrome") {
    tem = ua.match(/\b(OPR|Edge)\/(\d+)/);
    if (tem != null)
      return {
        name: tem[1].replace("OPR", "Opera"),
        version: parseInt(tem[2]),
        buildID: "",
      };
  }
  M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, "-?"];
  if ((tem = ua.match(/version\/(\d+)/i)) != null) {
    M.splice(1, 1, tem[1]);
  }
  let buildID = (navigator as any).buildID;
  // only exists for FF, this below is for Chrome
  if (buildID == null && navigator.appVersion != null) {
    try {
      const vers = navigator.appVersion.match(/\bChrome\/([0-9.]+)\b/);
      if (vers != null) {
        buildID = vers[1].split(".").map((x) => parseInt(x));
      }
    } catch {
      console.log(`Unable to extract buildID from ${navigator.appVersion}`);
    }
  }
  return {
    name: M[0],
    version: parseInt(M[1]),
    buildID,
  };
}

const SKIP_TOKEN = "skip_preflight";

const STYLE = {
  textAlign: "center",
  border: "1px solid #ccc",
  borderRadius: "5px",
  margin: "30px",
  padding: "30px",
  backgroundColor: "#f8f8f8",
  fontFamily: "sans-serif",
} as React.CSSProperties;

function allowedToRun(spec: Spec) {
  if (window.location.href.includes(SKIP_TOKEN)) {
    return true;
  }
  console.log("Browser:", spec); //Object { name: "Firefox", version: 42 }

  const oldFF = spec.name === "Firefox" && spec.version < 67;
  const oldIE = spec.name === "MSIE" || spec.name === "IE"; // all of them are a problem
  const oldEdge = spec.name === "Edge" && spec.version < 14;
  const oldSafari = spec.name === "Safari" && spec.version < 10;
  const oldOpera = spec.name === "Opera" && spec.version < 55;
  const oldChrome = spec.name === "Chrome" && spec.version < 62;
  // The code above to compute the spec can certainly return names other than those
  // explicitly listed below.  E.g., if you set `const ua="foo"`, then it returns
  // a name of "Netscape"!  We declare anything not in this list "oldOther".
  const oldOther =
    ["Firefox", "MSIE", "IE", "Edge", "Safari", "Opera", "Chrome"].indexOf(
      spec.name
    ) == -1;

  if (oldOther) {
    // It doesn't match any of our tests.  This currently *does* happen
    // with the Juno iPad app, whose agent looks like this
    // "Mozilla/5.0 (iPad; CPU iPhone OS like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
    // We just allow anything like this, since it's much likely to be new/good,
    // rather than a known old broken browser.
    return true;
  }

  const old =
    oldFF || oldIE || oldEdge || oldSafari || oldOpera || oldChrome || oldOther;

  return !old;
}

export default function PreflightCheck() {
  const spec = getSpec();
  const allowed = allowedToRun(spec);
  React.useLayoutEffect(() => {
    if (!allowed) {
      // Cause everything to stop right after
      // the initial render.
      window.stop();
    }
  }, [allowed]);

  if (allowed) {
    console.log("Browser is supported.");
    return null;
  }

  return (
    <div style={STYLE}>
      <h1 style={{ color: "red", fontSize: "400%" }}>&#9888;</h1>
      <h2>
        {APP_NAME} does not support {spec.name} version {spec.version}.
      </h2>
      <div>
        <p>
          We recommend that you use the newest version of{" "}
          <A href="https://google.com/chrome">Google Chrome</A> or{" "}
          <A href="https://www.mozilla.org/">Firefox</A>.
        </p>
      </div>
      <div style={{ marginTop: "20px" }}>
        Learn more about our{" "}
        <A href="https://github.com/sagemathinc/cocalc/wiki/BrowserRequirements">
          browser requirements
        </A>
        .
      </div>
      <div style={{ marginTop: "20px", fontWeight: "bold", fontSize: "115%" }}>
        <a href={`./app?${SKIP_TOKEN}`} style={{ textDecoration: "none" }}>
          Use {APP_NAME} with my unsupported browser anyways...
        </a>
      </div>
    </div>
  );
}

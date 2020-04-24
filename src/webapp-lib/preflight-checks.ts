/*
ES6 support https://www.w3schools.com/js/js_versions.asp
Firefox: 54
Edge: 14
Safari: 10
Opera: 55
Chrome is wrong on that page, I assume we should check for 61 or 62.
*/

type NAMES = "Firefox" | "MSIE" | "IE" | "Edge" | "Safari" | "Opera" | "Chrome";

interface ISpecs {
  name: NAMES;
  version: number;
  /* buildID: string for FF, first 8 digits are a date-timestamp; int-quadruple for chrome */
  buildID: string | number[] | undefined;
}

/* credits: https://stackoverflow.com/a/38080051/54236 */
const get_spec = function (): ISpecs {
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
        name: tem[1].replace("OPR", "Opera") as NAMES,
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
    name: M[0] as NAMES,
    version: parseInt(M[1]),
    buildID,
  };
};

function halt_and_catch_fire(msg: string): void {
  msg = `<div style='text-align:center'>
          <h1 style="color:red;font-size:400%">&#9888;</h1>
          ${msg}
          <div style="margin-top: 20px;">Learn more about our
            <a href="https://github.com/sagemathinc/cocalc/wiki/BrowserRequirements" target="_blank" rel="noopener">browser requirements</a>.
          </div>
          <div style="margin-top: 20px; font-weight:bold; font-size: 115%">
            <a href="./app?${SKIP_TOKEN}">Use CoCalc anyways with my unsupported browser...</a>
          </div>
         </div>`;
  // clean page
  for (const eid of ["smc-startup-banner-status", "smc-startup-banner"]) {
    const banner = document.getElementById(eid);
    if (banner != null && banner.parentNode != null) {
      banner.parentNode.removeChild(banner);
    }
  }
  // write message
  document.open();
  document.write(msg);
  document.close();
  window.stop();
}

const SKIP_TOKEN = "skip_preflight";

function preflight_check(): void {
  const spec = get_spec();
  navigator["browserSpecs"] = spec;

  console.log("browser spec:", spec); //Object { name: "Firefox", version: 42 }

  // this is for checking a minimum age
  const oldFF = spec.name === "Firefox" && spec.version < 54;
  const oldIE = spec.name === "MSIE" || spec.name === "IE"; // all of them are a problem
  const oldEdge = spec.name === "Edge" && spec.version < 14;
  const oldSafari = spec.name === "Safari" && spec.version < 10;
  const oldOpera = spec.name === "Opera" && spec.version < 55;
  const oldChrome = spec.name === "Chrome" && spec.version < 62;

  // known FF browser bug -- unless https://github.com/sagemathinc/cocalc/issues/2875#issuecomment-420686094
  // we check if the buildID (date ISO string plus some version number) is at least indicating version 60.2esr or later
  const ff60esr =
    spec.name === "Firefox" &&
    spec.version == 60 &&
    spec.buildID !== undefined &&
    typeof spec.buildID === "string" &&
    spec.buildID.length >= 8 &&
    spec.buildID.slice(0, 8) >= "20180903";

  // 69 to 61 have issues, and 65 up until beta8 exhibits similar issues.
  // 65 resolved in beta9. upstream: https://bugzilla.mozilla.org/show_bug.cgi?id=1514688
  // 66 is broken badly again: https://github.com/sagemathinc/cocalc/issues/3771
  const buggyFF =
    spec.name === "Firefox" &&
    ((59 <= spec.version && spec.version <= 61) || spec.version == 66) &&
    !ff60esr;

  if (oldFF || oldIE || oldEdge || oldSafari || oldOpera || oldChrome) {
    const msg = `
      <h2>CoCalc does not support ${spec.name} version ${spec.version}.</h2>
      <div>
          <p>We recommend that you use the newest version of <a target="_blank" rel="noopener" href='https://google.com/chrome'>Google Chrome</a>.</p>
      </div>`;
    halt_and_catch_fire(msg);
  } else if (buggyFF) {
    const msg = `
      <h2>CoCalc does not work with ${spec.name} version ${spec.version}.</h2>
      <div>
          <p style="font-weight:bold">
             You will have trouble using CoCalc with your current browser, because of
             <a href="https://github.com/sagemathinc/cocalc/issues/2875">issue #2875</a> caused by
             <a href="https://bugzilla.mozilla.org/show_bug.cgi?id=1453204">firefox issue #1453204</a>.
             (Something similar now afflicts Firefox 66 too.)
          </p>
          <p>Either update to at least Firefox version 62,
             switch to a recent version of <a target="_blank" rel="noopener" href='https://google.com/chrome'>Google Chrome</a>,
             or tweak your TSL settings (we wouldn't recommend that, though):
             <a href="https://tinyurl.com/y9hphj39">https://tinyurl.com/y9hphj39</a> and
             <a href="https://tinyurl.com/yboeepsf">https://tinyurl.com/yboeepsf</a>.
          </p>
      </div>`;
    halt_and_catch_fire(msg);
  }
}

if (window.location.search.indexOf(SKIP_TOKEN) < 0) {
  preflight_check();
}

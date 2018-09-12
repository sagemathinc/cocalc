/*
ES6 support https://www.w3schools.com/js/js_versions.asp
Firefox: 54
Edge: 14
Safari: 10
Opera: 55
Chrome is wrong on that page, I assume we should check for 61 or 62.
*/

interface ISpecs {
  name: string;
  version: number;
  buildID: string /* only FF, first 8 digits are a date-timestamp */;
}

/* credits: https://stackoverflow.com/a/38080051/54236 */
const get_spec = function(): ISpecs {
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
        buildID: ""
      };
  }
  M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, "-?"];
  if ((tem = ua.match(/version\/(\d+)/i)) != null) {
    M.splice(1, 1, tem[1]);
  }
  return { name: M[0], version: parseInt(M[1]), buildID: navigator.buildID };
};

function halt_and_catch_fire(msg: string): void {
  // clean page
  for (let eid of ["smc-startup-banner-status", "smc-startup-banner"]) {
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
    (spec.buildID !== undefined &&
      spec.buildID.length >= 8 &&
      spec.buildID.slice(0, 8) >= "20180903");

  const buggyFF =
    spec.name === "Firefox" &&
    59 <= spec.version &&
    spec.version <= 61 &&
    !ff60esr;

  if (oldFF || oldIE || oldEdge || oldSafari || oldOpera || oldChrome) {
    const msg = `<div style='text-align:center'>
      <h1 style="color:red;font-size:400%">&#9888;</h1>
      <h2>CoCalc does not support ${spec.name} version ${spec.version}.</h2>
      <div>
          <p>We recommend that you use the newest version of <a target="_blank" href='https://google.com/chrome'>Google Chrome</a>.</p>
          <p>Learn more about our
            <a href="https://github.com/sagemathinc/cocalc/wiki/BrowserRequirements" target="_blank" >browser requirements</a>.
          </p>
          <p style="font-weight:bold; font-size: 115%">
            <a href="./app?${SKIP_TOKEN}">Try to use CoCalc anyways with my old browser...</a>
          </p>
      </div>
    </div>`;
    halt_and_catch_fire(msg);
  } else if (buggyFF) {
    const msg = `<div style='text-align:center'>
      <h1 style="color:red;font-size:400%">&#9888;</h1>
      <h2>CoCalc does not work with ${spec.name} version ${spec.version}.</h2>
      <div>
          <p style="font-weight:bold">
             You cannot use CoCac with your current browser, because of
             <a href="https://github.com/sagemathinc/cocalc/issues/2875">issue #2875</a> caused by
             <a href="https://bugzilla.mozilla.org/show_bug.cgi?id=1453204">firefox issue #1453204</a>!
          </p>
          <p>Either update to at least Firefox version 62,
             switch to a recent version of <a target="_blank" href='https://google.com/chrome'>Google Chrome</a>,
             or tweak your TSL settings (we wouldn't recommend that, though):
             <a href="https://tinyurl.com/y9hphj39">https://tinyurl.com/y9hphj39</a> and
             <a href="https://tinyurl.com/yboeepsf">https://tinyurl.com/yboeepsf</a>.
          </p>
          <p>Learn more about our
            <a href="https://github.com/sagemathinc/cocalc/wiki/BrowserRequirements" target="_blank" >browser requirements</a>.
          </p>
          <p style="font-weight:bold; font-size: 115%">
            <a href="./app?${SKIP_TOKEN}">Try to use CoCalc anyways with my broken browser...</a>
          </p>
      </div>
    </div>`;
    halt_and_catch_fire(msg);
  }
}

if (window.location.search.indexOf(SKIP_TOKEN) < 0) {
  preflight_check();
}

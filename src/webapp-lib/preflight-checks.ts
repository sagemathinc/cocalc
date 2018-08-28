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
}

/* credits: https://stackoverflow.com/a/38080051/54236 */
const get_spec = function(): ISpecs {
  const mstr = /(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i;
  const ua = navigator.userAgent;
  let tem: RegExpMatchArray | null;
  let M = ua.match(mstr) || [];
  if (/trident/i.test(M[1])) {
    tem = /\brv[ :]+(\d+)/g.exec(ua) || [];
    return { name: "IE", version: parseInt(tem[1]) || NaN };
  }
  if (M[1] === "Chrome") {
    tem = ua.match(/\b(OPR|Edge)\/(\d+)/);
    if (tem != null)
      return {
        name: tem[1].replace("OPR", "Opera"),
        version: parseInt(tem[2])
      };
  }
  M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, "-?"];
  if ((tem = ua.match(/version\/(\d+)/i)) != null) {
    M.splice(1, 1, tem[1]);
  }
  return { name: M[0], version: parseInt(M[1]) };
};

const SKIP_TOKEN = "skip_preflight";

function preflight_check(): void {
  const spec = get_spec();
  navigator["browserSpecs"] = spec;

  console.log("browser spec:", spec); //Object { name: "Firefox", version: 42 }

  const oldFF = spec.name === "Firefox" && spec.version < 54;
  const oldIE = spec.name === "MSIE" || spec.name === "IE"; // all of them are a problem
  const oldEdge = spec.name === "Edge" && spec.version < 14;
  const oldSafari = spec.name === "Safari" && spec.version < 10;
  const oldOpera = spec.name === "Opera" && spec.version < 55;
  const oldChrome = spec.name === "Chrome" && spec.version < 62;

  if (oldFF || oldIE || oldEdge || oldSafari || oldOpera || oldChrome) {
    for (let eid of ["smc-startup-banner-status", "smc-startup-banner"]) {
      const banner = document.getElementById(eid);
      if (banner != null && banner.parentNode != null) {
        banner.parentNode.removeChild(banner);
      }
    }

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
    document.open();
    document.write(msg);
    document.close();
    window.stop();
  }
}

if (window.location.search.indexOf(SKIP_TOKEN) < 0) {
  preflight_check();
}

declare var MathJax: any;
declare var $: any;
declare var CDN_VERSIONS: any; // set by webpack
import { mathjax_finish_startup } from "./mathjax";
import { MathJaxConfig } from "@cocalc/util/mathjax-config";
import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

export default function loadMathJax() {
  if ((window as any).MathJax != null) {
    // already loaded.
    return (window as any).MathJax;
  }
  // load the mathjax configuration before mathjax starts up
  (window as any).MathJax = MathJaxConfig;

  if (!CDN_VERSIONS) {
    // Should be set by Webpack.  This should never ever happen.
    console.log(
      "WARNING: MathJax rendering fallback is NOT enabled.  Only katex rendering is available for math formulas!"
    );
  } else {
    // mathjax startup. config is set above, now we dynamically insert the mathjax script URL
    const src = join(
      appBasePath,
      `cdn/mathjax-${CDN_VERSIONS.mathjax}/MathJax.js`
    );

    const mjscript = document.createElement("script");
    mjscript.type = "text/javascript";
    mjscript.src = src;
    mjscript.onload = function () {
      // once loaded, we finalize the configuration and process pending rendering requests
      MathJax.Hub?.Queue([mathjax_finish_startup]);
    };
    document.getElementsByTagName("head")[0].appendChild(mjscript);
  }
  return (window as any).MathJax;
}

// The official antd docs suggest doing this first.  It normalizes
// the css in a way that is compatible with antd.
// I think this is the correct fix for https://github.com/sagemathinc/cocalc/issues/6285
// now that we are using antd v5.
import "antd/dist/reset.css";

// Initialize the appBasePath for the frontend codebase.
import "@cocalc/frontend/customize/app-base-path";

// CoCalc 3rd party libraries
import "@cocalc/cdn/dist/codemirror/lib/codemirror.css";
import "@cocalc/cdn/dist/katex/katex.min.css";
import "@cocalc/frontend/editors/slate/elements/elements.css";

import type { AppProps } from "next/app";

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}

export default MyApp;

// Duplicated in packages/frontend/codemirror/css.js
import "@cocalc/cdn/dist/codemirror/theme/3024-day.css";
import "@cocalc/cdn/dist/codemirror/theme/3024-night.css";
import "@cocalc/cdn/dist/codemirror/theme/abcdef.css";
import "@cocalc/cdn/dist/codemirror/theme/ambiance.css";
import "@cocalc/cdn/dist/codemirror/theme/base16-dark.css";
import "@cocalc/cdn/dist/codemirror/theme/base16-light.css";
import "@cocalc/cdn/dist/codemirror/theme/bespin.css";
import "@cocalc/cdn/dist/codemirror/theme/blackboard.css";
import "@cocalc/cdn/dist/codemirror/theme/cobalt.css";
import "@cocalc/cdn/dist/codemirror/theme/colorforth.css";
import "@cocalc/cdn/dist/codemirror/theme/darcula.css";
import "@cocalc/cdn/dist/codemirror/theme/dracula.css";
import "@cocalc/cdn/dist/codemirror/theme/duotone-dark.css";
import "@cocalc/cdn/dist/codemirror/theme/duotone-light.css";
import "@cocalc/cdn/dist/codemirror/theme/eclipse.css";
import "@cocalc/cdn/dist/codemirror/theme/elegant.css";
import "@cocalc/cdn/dist/codemirror/theme/erlang-dark.css";
import "@cocalc/cdn/dist/codemirror/theme/gruvbox-dark.css";
import "@cocalc/cdn/dist/codemirror/theme/hopscotch.css";
import "@cocalc/cdn/dist/codemirror/theme/icecoder.css";
import "@cocalc/cdn/dist/codemirror/theme/idea.css";
import "@cocalc/cdn/dist/codemirror/theme/isotope.css";
import "@cocalc/cdn/dist/codemirror/theme/lesser-dark.css";
import "@cocalc/cdn/dist/codemirror/theme/liquibyte.css";
import "@cocalc/cdn/dist/codemirror/theme/lucario.css";
import "@cocalc/cdn/dist/codemirror/theme/material.css";
import "@cocalc/cdn/dist/codemirror/theme/mbo.css";
import "@cocalc/cdn/dist/codemirror/theme/mdn-like.css";
import "@cocalc/cdn/dist/codemirror/theme/midnight.css";
import "@cocalc/cdn/dist/codemirror/theme/monokai.css";
import "@cocalc/cdn/dist/codemirror/theme/neat.css";
import "@cocalc/cdn/dist/codemirror/theme/neo.css";
import "@cocalc/cdn/dist/codemirror/theme/night.css";
import "@cocalc/cdn/dist/codemirror/theme/oceanic-next.css";
import "@cocalc/cdn/dist/codemirror/theme/panda-syntax.css";
import "@cocalc/cdn/dist/codemirror/theme/paraiso-dark.css";
import "@cocalc/cdn/dist/codemirror/theme/paraiso-light.css";
import "@cocalc/cdn/dist/codemirror/theme/pastel-on-dark.css";
import "@cocalc/cdn/dist/codemirror/theme/railscasts.css";
import "@cocalc/cdn/dist/codemirror/theme/rubyblue.css";
import "@cocalc/cdn/dist/codemirror/theme/seti.css";
import "@cocalc/cdn/dist/codemirror/theme/shadowfox.css";
import "@cocalc/cdn/dist/codemirror/theme/solarized.css";
import "@cocalc/cdn/dist/codemirror/theme/ssms.css";
import "@cocalc/cdn/dist/codemirror/theme/the-matrix.css";
import "@cocalc/cdn/dist/codemirror/theme/tomorrow-night-bright.css";
import "@cocalc/cdn/dist/codemirror/theme/tomorrow-night-eighties.css";
import "@cocalc/cdn/dist/codemirror/theme/ttcn.css";
import "@cocalc/cdn/dist/codemirror/theme/twilight.css";
import "@cocalc/cdn/dist/codemirror/theme/vibrant-ink.css";
import "@cocalc/cdn/dist/codemirror/theme/xq-dark.css";
import "@cocalc/cdn/dist/codemirror/theme/xq-light.css";
import "@cocalc/cdn/dist/codemirror/theme/yeti.css";
import "@cocalc/cdn/dist/codemirror/theme/zenburn.css";
import "@uiw/react-textarea-code-editor/dist.css";

// this must be last to overwrite things like antd
import "../styles/globals.css";

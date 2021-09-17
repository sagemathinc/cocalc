import "antd/dist/antd.css";
import "@cocalc/cdn/dist/codemirror/lib/codemirror.css";
import "@cocalc/cdn/dist/katex/katex.min.css";
import "@cocalc/frontend/editors/slate/elements/elements.css";
import "../styles/globals.css"; // this must be last to overwrite things like antd

import type { AppProps } from "next/app";

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}

export default MyApp;

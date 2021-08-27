import "../styles/globals.css";
import "antd/dist/antd.css";
import "@cocalc/cdn/dist/codemirror/lib/codemirror.css";
import "@cocalc/cdn/dist/katex/katex.min.css";
import "@cocalc/frontend/editors/slate/elements/elements.css";

import type { AppProps } from "next/app";

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}

export default MyApp;

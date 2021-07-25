import type { AppProps } from "next/app";
import { Layout, Embed } from "components/layout";
import "antd/dist/antd.min.css";
import "codemirror/lib/codemirror.css";
import "katex/dist/katex.min.css";

export default function MyApp({ Component, pageProps }: AppProps) {
  if (pageProps.layout == "embed") {
    // e.g., used by embed view
    return (
      <Embed>
        <Component {...pageProps} />
      </Embed>
    );
  }
  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}

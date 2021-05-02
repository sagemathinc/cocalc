/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Layout, Embed } from "components/layout";
import "antd/dist/antd.min.css";
import Loading from "components/loading";
import "codemirror/lib/codemirror.css";
import "katex/dist/katex.min.css";

export default function MyApp({ Component, pageProps }) {
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

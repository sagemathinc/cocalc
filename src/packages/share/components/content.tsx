import { Layout } from "antd";

import { siteName, anonymousSignup } from "lib/customize";

export default function Content() {
  return (
    <Layout.Content style={{ backgroundColor: "#c7d9f5" }}>
      <h1>SHARE SERVER</h1>
      {siteName}
      {anonymousSignup ? "anonymous sign up allowed" : "NO anonymous"}
    </Layout.Content>
  );
}

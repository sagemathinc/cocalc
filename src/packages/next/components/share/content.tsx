import { Layout } from "antd";
import { useCustomize } from "lib/customize";

export default function Content() {
  const { siteName, anonymousSignup } = useCustomize();
  return (
    <Layout.Content style={{ backgroundColor: "#c7d9f5" }}>
      <h1>SHARE SERVER</h1>
      {siteName}
      {anonymousSignup ? "anonymous sign up allowed" : "NO anonymous"}
    </Layout.Content>
  );
}

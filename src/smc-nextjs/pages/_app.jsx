import Layout from "components/layout";
import "antd/dist/antd.min.css";

export default function MyApp({ Component, pageProps }) {
  if (pageProps.noLayout) {
    // e.g., used by embed view
    return <Component {...pageProps} />;
  }
  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}

import "styles/global.css";
import Layout from "components/layout";
import "antd/dist/antd.min.css";

function MyApp({ Component, pageProps }) {
  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}

export default MyApp;

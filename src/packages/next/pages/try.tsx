import { Layout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import Head from "components/landing/head";
import basePath from "lib/base-path";
import Try from "components/account/try";

export default function Home({ customize }) {
  const { siteName } = customize;
  return (
    <Customize value={customize}>
      <Head title={`Try ${siteName} Now!`} />
      <Layout>
        <Header page="try" />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <Try />
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const customize = await withCustomize({ context });
  if (customize.props.customize.account != null) {
    // user is already signed in -- redirect them to top level page for now (todo).
    const { res } = context;
    res.writeHead(302, { location: basePath });
    res.end();
    return { props: {} };
  }
  return customize;
}

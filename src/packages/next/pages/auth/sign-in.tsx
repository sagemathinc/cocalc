import { Layout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import Head from "components/landing/head";
import basePath from "lib/base-path";
import SignIn from "components/auth/sign-in";
import getStrategies from "@cocalc/server/auth/sso/get-strategies";

export default function Home({ customize, strategies }) {
  const { siteName } = customize;
  return (
    <Customize value={customize}>
      <Head title={`Sign in to ${siteName}`} />
      <Layout>
        <Header page="sign-in" subPage="sign-in" />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <SignIn strategies={strategies} />
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const customize = await withCustomize({ context });
  if (customize.props.customize.account != null) {
    // user is already signed in -- redirect them to top level page.
    const { res } = context;
    res.writeHead(302, { location: basePath });
    res.end();
    return { props: {} };
  }
  customize.props.strategies = await getStrategies();
  return customize;
}

import { Layout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import Head from "components/landing/head";
import basePath from "lib/base-path";
import SignUp from "components/auth/sign-up";
import getStrategies from "@cocalc/backend/auth/sso/get-strategies";
import getRequiresToken from "@cocalc/backend/auth/tokens/get-requires-token";

export default function Home({ customize, strategies, requiresToken }) {
  const { siteName } = customize;
  return (
    <Customize value={customize}>
      <Head title={`Sign in to ${siteName}`} />
      <Layout>
        <Header page="sign-up" />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <SignUp strategies={strategies} requiresToken={requiresToken} />
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
  customize.props.strategies = await getStrategies();
  customize.props.requiresToken = await getRequiresToken();
  return customize;
}

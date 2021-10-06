import { Layout } from "antd";
import Footer from "components/landing/footer";
import A from "components/misc/A";
import SquareLogo from "components/logo-square";
import Header from "components/landing/header";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import Head from "components/landing/head";
import basePath from "lib/base-path";

export default function Home({ customize }) {
  const { siteName } = customize;
  return (
    <Customize value={customize}>
      <Head title={`Sign in to ${siteName}`} />
      <Layout>
        <Header page="signup" />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <SquareLogo style={{ width: "120px", height: "120px" }} />
          Create a {siteName} Account
          <br />
          I agree to the Terms of Service. I also agree to receive occasional
          emails from CoCalc related to support.
          <br />
          Already have an account? <A href="/signin">Sign in...</A>
          <br />
          Don't want to provide us with any information?{" "}
          <A href="/try">Try {siteName} without creating an account...</A>
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

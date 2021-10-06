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
      <Head title={`Try ${siteName} Now!`} />
      <Layout>
        <Header page="try" />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <SquareLogo style={{ width: "120px", height: "120px" }} />
          <A href="static/app.html?anonymous=jupyter">
            Try out CoCalc Anonymously right now...
          </A>
          <br />
          You do <b>not</b> have to <A href="/signup">create an account</A>.
          Instead, when you{" "}
          <A href="static/app.html?anonymous=jupyter">
            try {siteName} anonymously
          </A>
          , a project is created for you with a Jupyter notebook, and you can
          play around with it. Later{" "}
          <A href="/signup">transition to an account</A>{" "}
          when you see how useful {siteName} is. If you already have a{" "}
          {siteName} account, <A href="/signin">you can also sign in</A>.
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

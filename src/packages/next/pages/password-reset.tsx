import { Layout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import Head from "components/landing/head";
import PasswordReset from "components/account/password-reset";

export default function Home({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={"Forgot your Password?"} />
      <Layout>
        <Header page="sign-in" subPage="password-reset" />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <PasswordReset />
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

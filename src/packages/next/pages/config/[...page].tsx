import { Layout } from "antd";
import Header from "components/landing/header";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import ConfigLayout from "components/account/config/layout";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

export default function Preferences({ customize, page }) {
  return (
    <Customize value={customize}>
      <Head title="Configuration" />
      <Layout>
        <Header />
        <ConfigLayout page={page} />
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const { page } = context.params;

  return await withCustomize({ context, props: { page } });
}

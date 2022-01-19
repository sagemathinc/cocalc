import { Layout } from "antd";
import Header from "components/landing/header";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Store from "components/store";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

export default function Preferences({ customize, page }) {
  return (
    <Customize value={customize}>
      <Head title="Store" />
      <Layout>
        <Header />
        <Store page={page} />
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  let { page } = context.params;
  if (page == null) {
    page = [];
  }

  return await withCustomize({ context, props: { page } });
}

import { Layout } from "antd";
import Header from "components/landing/header";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import Redirect from "components/misc/redirect";

/*
Right now this is just a redirect.  It's possible it could involve something more in the future.
Right now users would only get here by clicking a link from within the nextjs app, and then
they get immediately navigated to the nextdb server.
*/
export default function Preferences({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="CRM Database" />
      <Layout>
        <Header />
        <Redirect target="/crm/db" external />
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

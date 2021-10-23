import { Layout } from "antd";
import Header from "components/landing/header";
import Footer from "components/landing/footer";
import Tickets from "components/support/tickets";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

export default function Preferences({ customize }) {
  return (
    <Customize value={customize}>
      <Layout>
        <Header page="support" subPage="tickets" />
        <Tickets />
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

import { Layout } from "antd";
import Header from "components/landing/header";
import Footer from "components/landing/footer";
import Status from "components/support/status";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

export default function Preferences({ customize }) {
  return (
    <Customize value={customize}>
      <Layout>
        <Header page="support" subPage="status" />
        <Status />
        <Footer/>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

import Link from "next/link";
import { Layout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/share/customize";
import Head from "components/landing/head";
import SquareLogo from "components/logo-square";
import SiteName from "components/share/site-name";

export default function Home({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={"Shared Public Files"} />
      <Layout>
        <Header />
        <div style={{ fontSize: "16pt", textAlign: "center", margin: "60px" }}>
          <SquareLogo style={{ width: "120px" }} />
          <br/><br/><br/>
          Browse recent{" "}
          <Link href="/share/public_paths/page/1">
            <a>
              <SiteName /> Shared Public Files...
            </a>
          </Link>
        </div>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}

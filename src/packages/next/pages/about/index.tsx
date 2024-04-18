import { Layout } from "antd";

import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import IndexList, { DataSource } from "components/landing/index-list";
import Image from "components/landing/image";
import SiteName from "components/share/site-name";
import A from "components/misc/A";

import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";

import AllAboutCoCalcImage from "public/about/all-about-cocalc.png";

const dataSource = [
  {
    link: "/about/events",
    title: "Events",
    logo: "global",
    description: (
      <>
        We regularly exhibit at academic conferences to engage with the academic
        community. <A href="/about/events">See where we'll be next!</A>
      </>
    ),
  },
  {
    link: "/about/team",
    title: "The Team",
    logo: "team-outlined",
    description: (
      <>
        Meet the <A href="/about/team">CoCalc team</A>.
      </>
    ),
  },
] as DataSource;

export default function Info({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="About" />
      <Layout>
        <Header page="about" />
        <IndexList
          title={
            <Image
              src={AllAboutCoCalcImage}
              style={{
                minWidth: '324px',
                maxWidth: '1512px',
                width: '75%',
              }}
              alt="All About CoCalc Logo"
            />
          }
          description={
            <>
              <SiteName /> is a cloud-based collaborative software oriented towards research,
              teaching, and scientific publishing purposes. Learn more about the story behind the
              software below.
            </>
          }
          dataSource={dataSource}
        />
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

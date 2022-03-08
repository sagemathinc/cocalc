import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import IndexList, { DataSource } from "components/landing/index-list";
import SiteName from "components/share/site-name";
import A from "components/misc/A";

const dataSource = [
  {
    link: "/info/doc",
    title: "Documentation",
    logo: "life-saver",
    description: (
      <>
        Where to find{" "}
        <A href="https://doc.cocalc.com">documentation about CoCalc</A>.
      </>
    ),
  },

  {
    link: "/info/status",
    title: "System Status",
    logo: "dashboard",
    description: (
      <>
        See how many people are{" "}
        <A href="/info/status">
          using <SiteName /> <b>right now</b>
        </A>
        , and view data about what they are doing.
      </>
    ),
  },

  {
    link: "/info/run",
    title: "Ways to Run CoCalc",
    logo: "server",
    description: (
      <>
        In addition to using CoCalc via the website cocalc.com, there are{" "}
        <A href="/info/run">several other ways to run CoCalc</A>.
      </>
    ),
  },
] as DataSource;

export default function Info({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Info" />
      <Header page="info" />
      <IndexList
        title={
          <>
            Information about <SiteName />
          </>
        }
        description={<>Information and links to resources for learning more.</>}
        dataSource={dataSource}
      />
      <Footer />
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

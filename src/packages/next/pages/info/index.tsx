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
    link: "/info/help",
    title: "Help and Support",
    logo: "life-saver",
    description: (
      <>
        Where to get more help and find{" "}
        <A href="https://doc.cocalc.com">documentation about CoCalc</A>.
      </>
    ),
  },
  {
    link: "/info/connect",
    title: "Connect with the Community",
    logo: "users",
    description: (
      <>
        <A href="https://discord.gg/nEHs2GK">Chat on Discord</A>, start a{" "}
        <A href="https://github.com/sagemathinc/cocalc/discussions">
          GitHub discussion
        </A>
        , view <A href="https://twitter.com/cocalc_com">our Twitter feed</A>,
        subscribe to{" "}
        <A href="https://groups.google.com/forum/?fromgroups#!forum/cocalc">
          the mailing list
        </A>
        , read <A href="http://blog.sagemath.com/">the blog</A>, browse our{" "}
        <A href="https://github.com/sagemathinc/cocalc/tree/master/src">
          source code
        </A>
        , and more.
      </>
    ),
  },
  {
    link: "/info/status",
    title: "System Status",
    logo: "dashboard",
    description: (
      <>
        See how many people are using <SiteName /> <b>right now</b>, and some
        data about what they are doing.
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

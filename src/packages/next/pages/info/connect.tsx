import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Layout } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import A from "components/misc/A";
import { Icon } from "@cocalc/frontend/components/icon";
import IndexList, { DataSource } from "components/landing/index-list";
import SiteName from "components/share/site-name";

import Discord from "public/info/discord.png";
import Share from "public/info/share.png";
import Blog from "public/info/blog.png";
import Twitter from "public/info/twitter.png";
import Facebook from "public/info/facebook.png";
import Github from "public/info/github.png";

const imageWidth = "350px";

const dataSource = [
  {
    link: "https://discord.gg/nEHs2GK",
    title: (
      <>
        <b>Chat</b> about CoCalc on Discord
      </>
    ),
    logo: "comment",
    image: Discord,
    imageWidth,
    description: (
      <>
        Visit the <A href="https://discord.gg/nEHs2GK">CoCalc Discord server</A>{" "}
        to chat with other CoCalc users, ask questions, and give us quick
        feedback.
      </>
    ),
  },
  {
    shareServer: true,
    link: "/share",
    logo: "bullhorn",
    imageWidth,
    image: Share,
    title: (
      <>
        <b>Explore</b> Published Files
      </>
    ),
    description: (
      <>
        <A href="/share">
          Browse the <SiteName /> share server
        </A>{" "}
        to see what other users of this site are publishing. You will find
        thousands of <A href="/features/jupyter-notebook">Jupyter notebooks</A>,
        Sage worksheets, programs, PDF's, final projects from courses,{" "}
        <A href="/features/latex-editor">research papers</A> and more.
      </>
    ),
  },
  {
    link: "https://github.com/sagemathinc/cocalc",
    logo: "github",
    imageWidth,
    image: Github,
    title: (
      <>
        CoCalc's <b>GitHub</b> Page
      </>
    ),
    description: (
      <>
        Browse every change to{" "}
        <A href="https://github.com/sagemathinc/cocalc/commits/master">
          CoCalc source code going back to <b>April 2012</b>
        </A>
        , track the status of{" "}
        <A href="https://github.com/sagemathinc/cocalc/issues?q=is%3Aissue+is%3Aopen+label%3AI-bug+-label%3Ablocked+sort%3Acreated-desc">
          known bugs
        </A>
        ,{" "}
        <A href="https://github.com/sagemathinc/cocalc/issues/new">
          report a bug
        </A>
        , comment on{" "}
        <A href="https://github.com/sagemathinc/cocalc/issues">
          development ideas
        </A>{" "}
        and see an{" "}
        <A href="https://github.com/sagemathinc/cocalc/graphs/contributors">
          overview of the pace of development
        </A>
        . While you're at it,{" "}
        <A href="https://github.com/sagemathinc/cocalc/network/members">
          fork CoCalc
        </A>{" "}
        and send us{" "}
        <A href="https://github.com/sagemathinc/cocalc/pulls">a pull request</A>
        .
      </>
    ),
  },
  {
    link: "https://groups.google.com/forum/?fromgroups#!forum/cocalc",
    logo: "envelope",
    title: (
      <>
        <b>Email</b> via the Google Groups Mailing List
      </>
    ),
    description: (
      <>
        Get announcements about CoCalc in your inbox, and use email to
        participate in discussions with the CoCalc community at the{" "}
        <A href="https://groups.google.com/forum/?fromgroups#!forum/cocalc">
          CoCalc mailing list
        </A>
        .
      </>
    ),
  },
  {
    link: "https://blog.cocalc.com/archive.html",
    logo: "blog",
    imageWidth,
    image: Blog,
    title: (
      <>
        <b>Read</b> the CoCalc blog
      </>
    ),
    description: (
      <>
        Read about new developments in CoCalc at{" "}
        <A href="https://blog.cocalc.com/archive.html">the CoCalc blog</A>. You
        can read about{" "}
        <A href="https://blog.cocalc.com/2018/10/11/collaborative-editing.html">
          how collaborative editing works
        </A>
        ,{" "}
        <A href="https://blog.cocalc.com/cocalc/2018/09/10/where-is-cocalc-from.html">
          who implements CoCalc
        </A>
        ,{" "}
        <A href="https://blog.cocalc.com/2017/02/09/rethinkdb-vs-postgres.html">
          why CoCalc uses PostgreSQL
        </A>
        , and much more.
      </>
    ),
  },
  {
    link: "https://twitter.com/cocalc_com",
    logo: "twitter",
    imageWidth,
    image: Twitter,
    title: (
      <>
        Follow CoCalc on <b>Twitter</b>
      </>
    ),
    description: (
      <>
        Follow{" "}
        <A href="https://twitter.com/cocalc_com">@cocalc_com on Twitter</A> for
        announcements about what's going on with CoCalc. You can also DM
        questions to us or tag us in your tweets.
      </>
    ),
  },
  {
    link: "https://www.facebook.com/CoCalcOnline/",
    logo: "facebook",
    imageWidth,
    image: Facebook,
    title: (
      <>
        CoCalc on <b>Facebook</b>
      </>
    ),
    description: (
      <>
        Check out our{" "}
        <A href="https://www.facebook.com/CoCalcOnline/">Facebook page</A>,
        where you can post something cool you've done using CoCalc, start a
        dicussion, or watch out for announcements.
      </>
    ),
  },
] as DataSource;

export default function Connect({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Connect with the Community" />
      <Header page="info" subPage="connect" />
      <Layout.Content
        style={{
          backgroundColor: "white",
        }}
      >
        <div
          style={{
            maxWidth: "900px",
            margin: "15px auto",
            padding: "15px",
            backgroundColor: "white",
          }}
        >
          <div style={{ textAlign: "center", color: "#444" }}>
            <h1 style={{ fontSize: "28pt" }}></h1>
          </div>
          <IndexList
            title={
              <>
                <Icon name="users" style={{ marginRight: "30px" }} />
                Connect with the Cocalc Community
              </>
            }
            description={
              <>
                There are many ways that you can connect with the broader CoCalc
                community.
              </>
            }
            dataSource={dataSource}
          />
        </div>
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}

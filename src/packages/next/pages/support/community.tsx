import { Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import IndexList, { DataSource } from "components/landing/index-list";
import A from "components/misc/A";
import SiteName from "components/share/site-name";
import { MAX_WIDTH } from "lib/config";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import MailingList from "public/info/cocalc-mailing-list.png";
import Discord from "public/info/discord.png";
import { COLORS } from "@cocalc/util/theme";
import Facebook from "public/info/facebook.png";
import GitHubDiscussions from "public/info/github-discussions.png";
import Github from "public/info/github.png";
import LinkedIn from "public/info/linkedin.png";
import Share from "public/info/share.png";
import Twitter from "public/info/twitter.png";

const imageWidth = "300px";

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
        Visit the{" "}
        <A href="https://discord.gg/EugdaJZ8">CoCalc Discord server</A> to chat
        with other CoCalc users, ask questions, and give us quick feedback.
      </>
    ),
  },
  {
    link: "https://github.com/sagemathinc/cocalc",
    logo: "github",
    imageWidth,
    image: Github,
    title: (
      <A href="https://github.com/sagemathinc/cocalc">
        CoCalc's <b>Source Code</b>
      </A>
    ),
    description: (
      <>
        Browse every change to{" "}
        <A href="https://github.com/sagemathinc/cocalc">CoCalc source code</A>,
        track the status of{" "}
        <A href="https://github.com/sagemathinc/cocalc/issues">known issues</A>,{" "}
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
    link: "https://www.linkedin.com/company/sagemath-inc./",
    logo: "linkedin",
    imageWidth,
    image: LinkedIn,
    title: (
      <A href="https://www.linkedin.com/company/sagemath-inc./">
        CoCalc on <b>LinkedIn</b>
      </A>
    ),
    description: (
      <>
        Explore{" "}
        <A href="https://www.linkedin.com/company/sagemath-inc./">
          CoCalc on LinkedIn
        </A>
        .
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
      <A href="/share">
        CoCalc <b>Published Files</b>
      </A>
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
    link: "https://www.facebook.com/CoCalcOnline/",
    logo: "facebook",
    imageWidth,
    image: Facebook,
    title: (
      <A href="https://www.facebook.com/CoCalcOnline/">
        CoCalc on <b>Facebook</b>
      </A>
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
  {
    link: "https://github.com/sagemathinc/cocalc/discussions",
    logo: "github",
    imageWidth,
    image: GitHubDiscussions,
    title: (
      <A href="https://github.com/sagemathinc/cocalc/discussions">
        CoCalc <b>GitHub Discussions</b>
      </A>
    ),
    description: (
      <>
        <A href="https://github.com/sagemathinc/cocalc/discussions">
          Search or ask questions and start a discussion about CoCalc here!
        </A>
      </>
    ),
  },
  {
    link: "https://groups.google.com/forum/?fromgroups#!forum/cocalc",
    logo: "envelope",
    image: MailingList,
    imageWidth,
    title: (
      <A href="https://groups.google.com/forum/?fromgroups#!forum/cocalc">
        CoCalc <b>Google Groups Mailing List</b>
      </A>
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
    link: "https://twitter.com/cocalc_com",
    logo: "twitter",
    imageWidth,
    image: Twitter,
    title: (
      <A href="https://twitter.com/cocalc_com">
        CoCalc on <b>Twitter/X</b>
      </A>
    ),
    description: (
      <>
        Follow{" "}
        <A href="https://twitter.com/cocalc_com">@cocalc_com on Twitter/X</A>{" "}
        for announcements about what's going on with CoCalc. You can also DM
        questions to us or tag us in your tweets.
      </>
    ),
  },
] as DataSource;

export default function Connect({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Community Support" />
      <Layout>
        <Header page="support" subPage="community" />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <div
            style={{
              maxWidth: MAX_WIDTH,
              margin: "15px auto",
              padding: "15px",
              backgroundColor: "white",
            }}
          >
            <div style={{ textAlign: "center", color: COLORS.GRAY_D }}>
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
                  There are many ways that you can connect with the broader
                  CoCalc community.
                </>
              }
              dataSource={dataSource}
            />
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

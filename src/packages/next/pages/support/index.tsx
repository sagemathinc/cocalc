import { Layout } from "antd";
import Header from "components/landing/header";
import Head from "components/landing/head";
import Footer from "components/landing/footer";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import A from "components/misc/A";
import ChatGPTHelp from "components/openai/chatgpt-help";

import IndexList, { DataSource } from "components/landing/index-list";

const dataSource = [
  {
    link: "/support/new",
    title: "Create a New Support Ticket",
    logo: "medkit",
    hide: (customize) => !customize.zendesk,
    description: (
      <>
        If you are having any trouble or just have a question,{" "}
        <A href="/support/new">
          <b>create a support ticket</b>
        </A>
        . You do NOT have to be a paying customer to open a ticket, though we
        prioritize customer requests.
      </>
    ),
  },
  {
    link: "/support/tickets",
    title: "Status of Support Tickets",
    logo: "life-saver",
    hide: (customize) => !customize.zendesk,
    description: (
      <>
        Check on the{" "}
        <A href="/support/tickets">
          <b>status of your support tickets</b>
        </A>
        .
      </>
    ),
  },
  {
    link: "/support/chatgpt",
    title: "ChatGPT Suppport",
    logo: "robot",
    hide: (customize) => !customize.openaiEnabled,
    description: (
      <>
        Our <A href="/support/chatgpt">integrated ChatGPT support</A> is free
        and often very helpful since it knows so much about the open source
        software in CoCalc.
        <ChatGPTHelp style={{ marginTop: "15px" }} size="large" />
      </>
    ),
  },
  {
    link: "/support/community",
    title: "CoCalc Community Support",
    logo: "users",
    description: (
      <>
        <A href="https://github.com/sagemathinc/cocalc/discussions">
          Join a discussion
        </A>{" "}
        or{" "}
        <A href="https://groups.google.com/forum/?fromgroups#!forum/cocalc">
          post to the mailing list.{" "}
        </A>
        We also have <A href="https://twitter.com/cocalc_com">a Twitter feed</A>{" "}
        and <A href="https://about.cocalc.com/cocalcs-blog/">a blog</A>.
      </>
    ),
  },
  {
    landingPages: true,
    link: "https://docs.google.com/forms/d/e/1FAIpQLSesDZkGD2XVu8BHKd_sPwn5g7MrLAA8EYRTpB6daedGVMTpkA/viewform",
    title: "Request a Live Demo!",
    logo: "video-camera",
    hide: (customize) => !customize.isCommercial,
    description: (
      <>
        If you're seriously considering using CoCalc to teach a course, but
        aren't sure of some of the details and really need to just{" "}
        <b>talk to a person</b>,{" "}
        <A href="https://docs.google.com/forms/d/e/1FAIpQLSesDZkGD2XVu8BHKd_sPwn5g7MrLAA8EYRTpB6daedGVMTpkA/viewform">
          fill out this form and request a live video chat with us
        </A>
        . We love chatting (in English and German), and will hopefully be able
        to answer all of your questions.
      </>
    ),
  },
] as DataSource;

export default function Preferences({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Support" />
      <Layout>
        <Header page="support" />
        <IndexList
          title="Support"
          description={
            <>
              We provide extremely good support to our users and customers. If
              you run into a problem, read{" "}
              <A href="https://doc.cocalc.com/">our extensive documentation</A>,{" "}
              <A href="/support/community">check online forums and chatrooms</A>{" "}
              or <A href="/support/new">create a support ticket</A>.
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

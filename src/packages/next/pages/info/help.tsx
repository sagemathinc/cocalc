import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Layout } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import A from "components/misc/A";
import { Icon } from "@cocalc/frontend/components/icon";
import IndexList, { DataSource, Item } from "components/landing/index-list";

const dataSource: DataSource = [
  {
    link: "https://doc.cocalc.com/",
    title: "Browse the CoCalc Manual",
    logo: "book",
    image: "https://doc.cocalc.com/_static/cocalc-doc-logo.svg",
    description: (
      <>
        The reference manual explains the major functionality of CoCalc in
        depth. In particular, it contains the{" "}
        <A href="https://doc.cocalc.com/teaching-instructors.html">
          Instructor Guide
        </A>
        , which explains how to integrate CoCalc with teaching a course, it
        documents{" "}
        <A href="https://doc.cocalc.com/project.html">
          configuring and using projects in CoCalc
        </A>
        , explains how to{" "}
        <A href="https://doc.cocalc.com/howto/index.html">
          install your own software,
        </A>
        and how to{" "}
        <A href="https://doc.cocalc.com/api/">
          embed and control CoCalc via the API
        </A>
        .
      </>
    ),
  },
  {
    landingPages: true,
    link: "https://docs.google.com/forms/d/e/1FAIpQLSesDZkGD2XVu8BHKd_sPwn5g7MrLAA8EYRTpB6daedGVMTpkA/viewform",
    title: "Request a Live Demo!",
    logo: "video-camera",
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
  {
    landingPages: true,
    link: "https://github.com/sagemathinc/cocalc-desktop#readme",
    title: "Install the CoCalc Desktop Application",
    logo: "laptop",
    description: (
      <>
        If you're having browser compatibility issues with CoCalc, you can try
        installing the{" "}
        <A href="https://github.com/sagemathinc/cocalc-desktop#readme">
          CoCalc desktop application for Windows and MacOS
        </A>
        . This is a lightweight application that connects to the main cocalc.com
        site, but is completely separate from your web browser.
      </>
    ),
  },
  {
    landingPages: true,
    link: "/pricing/onprem",
    title: "Install CoCalc on Your Own Server or Cluster",
    logo: "server",
    description: (
      <>
        It is possible to{" "}
        <A href="/pricing/onprem">
          fully run your own commercially supported instance of CoCalc
        </A>{" "}
        on anything from your laptop to a large Kubernetes cluster.
      </>
    ),
  },
] as DataSource;

export default function Help({ customize }) {
  const { siteName, contactEmail } = customize;
  let data = dataSource;
  if (contactEmail) {
    const link = `mailto:${contactEmail}`;
    data = [
      {
        logo: "envelope",
        link,
        title: (
          <>
            <b>Email us at {contactEmail}</b>
          </>
        ),
        description: (
          <>
            If you have a question or problem, please send an email to{" "}
            <A href={link}>{contactEmail}</A>. Be as specific as you can. In
            particular, include URL's of relevant files!
          </>
        ),
      } as Item,
    ].concat(dataSource);
  }
  return (
    <Customize value={customize}>
      <Head title="Help and Support" />
      <Header page="info" subPage="help" />
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
          <IndexList
            title={
              <>
                <Icon name="life-saver" style={{ marginRight: "30px" }} />
                {siteName} - Help and Support
              </>
            }
            description={
              <>
                There are many ways that you can connect with the broader CoCalc
                community.
              </>
            }
            dataSource={data}
          />
        </div>
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

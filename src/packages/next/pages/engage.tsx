import { useEffect, useState } from "react";

function Engage() {
  const [body, setBody] = useState<any>(null);
  useEffect(() => {
    // @ts-ignore
    window.DEBUG = true;
    (async () => {
      const Stopwatch = (
        await import("@cocalc/frontend/editors/stopwatch/stopwatch")
      ).default;
      console.log("loaded Stopwatch", Stopwatch);
      setBody(
        <Stopwatch
          state="running"
          time={new Date().valueOf()}
          clickButton={(btn) => console.log("clicked", btn)}
        />
      );
    })();
  }, []);
  return (
    <div style={{ margin: "30px", border: "1px solid grey", padding: "30px" }}>
      <h1>Example of testing backend vs frontend code splitting.</h1>
      <br />
      {body}
    </div>
  );
}

import { Layout } from "antd";
import Footer from "components/landing/footer";
import A from "components/misc/A";
import SquareLogo from "components/logo-square";
import Header from "components/landing/header";
import Content from "components/landing/content";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import Head from "components/landing/head";
import { join } from "path";
import basePath from "lib/base-path";

import screenshot from "public/cocalc-screenshot-20200128-nq8.png";

const topLinkStyle = { marginRight: "20px" };

export default function Home({ customize }) {
  const {
    siteName,
    siteDescription,
    organizationName,
    organizationURL,
    splashImage,
    indexInfo,
  } = customize;
  return (
    <Customize value={customize}>
      <Head title="Collaborative Calculation" />
      <Layout>
        <Header />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <Engage />
          {customize.account && (
            <div
              style={{
                textAlign: "center",
                margin: "30px 0 -15px 0",
                color: "#666",
                fontSize: "30pt",
                fontWeight: 500,
              }}
            >
              Signed in as{" "}
              <A href="/config">
                {customize.account.is_anonymous
                  ? "Anonymous User"
                  : `${customize.account.first_name} ${
                      customize.account.last_name
                    } ${
                      customize.account.name
                        ? "(@" + customize.account.name + ")"
                        : ""
                    }`}
              </A>
              <div style={{ fontSize: "10pt", margin: "15px 0" }}>
                {customize.account != null && (
                  <>
                    <A
                      href={join(basePath, "projects")}
                      external
                      style={topLinkStyle}
                    >
                      Projects
                    </A>{" "}
                  </>
                )}
                {customize.landingPages && (
                  <>
                    <A href="/features/" style={topLinkStyle}>
                      Features
                    </A>{" "}
                    <A href="/software" style={topLinkStyle}>
                      Software
                    </A>{" "}
                    {customize.isCommercial && (
                      <>
                        <A href="/pricing" style={topLinkStyle}>
                          Pricing
                        </A>{" "}
                      </>
                    )}
                  </>
                )}
                {customize.account != null && (
                  <>
                    <A href={"/config"} style={topLinkStyle}>
                      Config
                    </A>{" "}
                  </>
                )}
                {customize.isCommercial &&
                  customize.account &&
                  !customize.account.is_anonymous && (
                    <>
                      <A href="/store" style={topLinkStyle}>
                        Store
                      </A>{" "}
                      <A href={"/licenses"} style={topLinkStyle}>
                        Licenses
                      </A>{" "}
                      <A href={"/billing"} style={topLinkStyle}>
                        Billing
                      </A>{" "}
                    </>
                  )}
                {customize.shareServer && (
                  <>
                    <A style={topLinkStyle} href={"/share/public_paths/page/1"}>
                      Share
                    </A>{" "}
                  </>
                )}
                <>
                  <A style={topLinkStyle} href="/support">
                    Support
                  </A>{" "}
                  <A style={topLinkStyle} href="/info/status">
                    Status
                  </A>{" "}
                  <A style={topLinkStyle} href="https://doc.cocalc.com">
                    Docs
                  </A>
                </>
              </div>
            </div>
          )}
          <Content
            logo={<SquareLogo style={{ width: "120px", height: "120px" }} />}
            title={siteName}
            subtitle={siteDescription}
            description={
              <div>
                An instance of <A href="https://cocalc.com">CoCalc</A>{" "}
                {organizationName && organizationURL && (
                  <>
                    hosted by <A href={organizationURL}>{organizationName}</A>
                  </>
                )}
                {customize.onCoCalcCom && (
                  <div style={{ marginTop: "15px" }}>
                    <iframe
                      width="210"
                      height="300"
                      src="https://www.youtube.com/embed/PQ5p92DN0bs"
                      title="YouTube video player"
                      frameBorder={0}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                    <br />
                    <br />
                    <A href="https://about.cocalc.com">
                      Learn All About CoCalc's Mission, Developers and
                      Features...
                    </A>
                  </div>
                )}
              </div>
            }
            image={splashImage ? splashImage : screenshot}
            alt={"Screenshot showing CoCalc in action!"}
            indexInfo={indexInfo}
          />
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context }, { name: true });
}

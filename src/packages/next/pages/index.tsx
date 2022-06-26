/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

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
import Path from "components/app/path";

const topLinkStyle = { marginRight: "20px" };

export default function Home({ customize }) {
  const {
    shareServer,
    siteName,
    siteDescription,
    organizationName,
    organizationURL,
    splashImage,
    indexInfo,
    sandboxProjectId,
  } = customize;
  return (
    <Customize value={customize}>
      <Head title="Collaborative Calculation" />
      <Layout>
        <Header />
        <Layout.Content style={{ backgroundColor: "white" }}>
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
                {`${customize.account.first_name} ${
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
                    <A href="https://about.cocalc.com">
                      Mission and Features of CoCalc
                    </A>
                    <br />
                    <br />
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
                  </div>
                )}
              </div>
            }
            image={
              sandboxProjectId
                ? undefined
                : splashImage
                ? splashImage
                : screenshot
            }
            aboveImage={
              <>
                {sandboxProjectId && (
                  <div style={{ marginBottom: "30px" }}>
                    <h3 style={{ textAlign: "center", color: "#666" }}>
                      The Public {siteName} Sandbox
                    </h3>
                    <Path
                      style={{ marginRight: "30px", marginBottom: "15px" }}
                      project_id={sandboxProjectId}
                    />
                  </div>
                )}
                {shareServer && (
                  <h3 style={{ textAlign: "center" }}>
                    <A href="/share/public_paths/page/1">
                      Explore what people have made using {siteName}!
                    </A>
                  </h3>
                )}
              </>
            }
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

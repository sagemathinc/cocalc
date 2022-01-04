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

import screenshot from "public/cocalc-screenshot-20200128-nq8.png";

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

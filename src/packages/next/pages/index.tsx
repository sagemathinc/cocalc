/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout, Tooltip } from "antd";
import { GetServerSidePropsContext } from "next";
import { join } from "path";

import { getRecentHeadlines } from "@cocalc/database/postgres/news";
import { COLORS } from "@cocalc/util/theme";
import { RecentHeadline } from "@cocalc/util/types/news";
import { CoCalcComFeatures } from "components/landing/cocalc-com-features";
import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { NewsBanner } from "components/landing/news-banner";
import { Tagline } from "components/landing/tagline";
import Logo from "components/logo";
import { CSS, Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import Videos, { Video } from "components/videos";
import basePath from "lib/base-path";
import { Customize, CustomizeType } from "lib/customize";
import { PublicPath as PublicPathType } from "lib/share/types";
import withCustomize from "lib/with-customize";
import screenshot from "public/cocalc-screenshot-20200128-nq8.png";

import type { JSX } from "react";

const TOP_LINK_STYLE: CSS = { marginRight: "20px" } as const;

interface Props {
  customize: CustomizeType;
  publicPaths: PublicPathType[];
  recentHeadlines: RecentHeadline[] | null;
  headlineIndex: number;
}

export default function Home(props: Props) {
  const { customize, recentHeadlines, headlineIndex } = props;
  const {
    siteName,
    siteDescription,
    organizationName,
    organizationURL,
    splashImage,
    indexInfo,
    onCoCalcCom,
    account,
    isCommercial,
    indexTagline,
  } = customize;

  function contentDescription() {
    return (
      <Paragraph type="secondary">
        {onCoCalcCom ? (
          <>by Sagemath, Inc.</>
        ) : (
          <>
            An instance of <A href="https://cocalc.com">CoCalc</A>
            {organizationName && organizationURL ? (
              <>
                {" "}
                hosted by <A href={organizationURL}>{organizationName}</A>
              </>
            ) : undefined}
            .
          </>
        )}
      </Paragraph>
    );
  }

  function topAccountLinks() {
    if (!account) return;
    return (
      <div
        style={{
          textAlign: "center",
          margin: "30px 0 15px 0",
        }}
      >
        <Title level={1} style={{ color: COLORS.GRAY }}>
          Signed in as{" "}
          <Tooltip title={"View all your account settings"} placement={"right"}>
            <a href={join(basePath, "settings")}>
              {`${account.first_name} ${account.last_name} ${
                account.name ? "(@" + account.name + ")" : ""
              }`}
            </a>
          </Tooltip>
        </Title>
        <Paragraph style={{ fontSize: "11pt", margin: "15px 0" }}>
          {isCommercial && account && !account.is_anonymous && (
            <>
              <a href={join(basePath, "store")} style={TOP_LINK_STYLE}>
                Store
              </a>{" "}
              <a
                href={join(basePath, "settings/purchases")}
                style={TOP_LINK_STYLE}
              >
                Purchases
              </a>{" "}
              <A href={"/vouchers"} style={TOP_LINK_STYLE}>
                Vouchers
              </A>{" "}
            </>
          )}
          <a href={join(basePath, "projects")} style={TOP_LINK_STYLE}>
            Projects
          </a>{" "}
          {customize.landingPages && (
            <>
              <A href="/features/" style={TOP_LINK_STYLE}>
                Features
              </A>{" "}
              <A href="/software" style={TOP_LINK_STYLE}>
                Software
              </A>{" "}
              {isCommercial && (
                <>
                  <A href="/pricing" style={TOP_LINK_STYLE}>
                    Pricing
                  </A>{" "}
                </>
              )}
            </>
          )}
        </Paragraph>
      </div>
    );
  }

  function renderCoCalcComFeatures() {
    if (!onCoCalcCom) return;
    return <CoCalcComFeatures />;
  }

  function logo(): JSX.Element {
    return <Logo type="full" style={{ width: "50%" }} />;
  }

  function renderNews() {
    if (recentHeadlines == null) return;
    return (
      <NewsBanner
        recentHeadlines={recentHeadlines}
        headlineIndex={headlineIndex}
      />
    );
  }

  return (
    <Customize value={customize}>
      <Head title={siteDescription ?? "Collaborative Calculation"} />
      <Layout>
        <Header />
        <Layout.Content style={{ backgroundColor: "white" }}>
          {renderNews()}
          {topAccountLinks()}
          <Content
            style={{ minHeight: "30vh" }}
            body={logo()}
            title={onCoCalcCom ? "" : siteName}
            subtitle={siteDescription}
            description={contentDescription()}
            image={splashImage ? splashImage : screenshot}
            alt={"Screenshot showing CoCalc in action!"}
            imageAlternative={
              onCoCalcCom ? <Videos videos={YOUTUBE_IDS} /> : indexInfo
            }
          />
          <Tagline value={indexTagline} style={{ padding: "5px" }} />
          {renderCoCalcComFeatures()}
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  // get most recent headlines
  const recentHeadlines = await getRecentHeadlines(5);
  // we want to not always show the same headlines at the start
  const headlineIndex =
    recentHeadlines != null
      ? Math.floor(Date.now() % recentHeadlines.length)
      : 0;

  return await withCustomize(
    { context, props: { recentHeadlines, headlineIndex } },
    { name: true },
  );
}

const YOUTUBE_IDS: Readonly<Video[]> = [
  { id: "oDdfmkQ0Hvw", title: "CoCalc Overview" },
  { id: "UfmjYxalyh0", title: "Using AI in CoCalc" },
  { id: "LLtLFtD8qfo", title: "Using JupyterLab in CoCalc" },
  { id: "OMN1af0LUcA", title: "Using OpenWebUI and Ollama On CoCalc" },
  { id: "Owq90O0vLJo", title: "R Studio on CoCalc" },
  { id: "JG6jm6yv_KE", title: "PyTorch with a GPU on CoCalc" },
  {
    id: "Uwn3ngzXD0Y",
    title: "JAX Quickstart on CoCalc using a GPU (or on CPU)",
  },
  { id: "NkNx6tx3nu0", title: "Running On-Prem Compute Servers on CoCalc" },
] as const;

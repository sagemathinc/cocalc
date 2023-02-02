/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Layout } from "antd";
import { join } from "path";

import getPool, { timeInSeconds } from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import { COLORS } from "@cocalc/util/theme";
import CoCalcComFeatures from "components/landing/cocalc-com-features";
import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Logo from "components/logo";
import { CSS, Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import getAccountId from "lib/account/get-account";
import basePath from "lib/base-path";
import { Customize, CustomizeType } from "lib/customize";
import { PublicPath as PublicPathType } from "lib/share/types";
import withCustomize from "lib/with-customize";
import screenshot from "public/cocalc-screenshot-20200128-nq8.png";
import BannerWithLinks from "components/landing/banner-with-links";

const topLinkStyle: CSS = { marginRight: "20px" };

interface Props {
  customize: CustomizeType;
  publicPaths: PublicPathType[];
}

export default function Home(props: Props) {
  const { customize, publicPaths } = props;
  const {
    shareServer,
    siteName,
    siteDescription,
    organizationName,
    organizationURL,
    splashImage,
    indexInfo,
    sandboxProjectId,
    onCoCalcCom,
  } = customize;

  function contentDescription() {
    return (
      <Paragraph type="secondary">
        {onCoCalcCom ? (
          <>by Sagemath, Inc.</>
        ) : (
          <>
            An instance of <A href="https://cocalc.com">CoCalc</A>
            {organizationName && organizationURL && (
              <>
                {" "}
                hosted by <A href={organizationURL}>{organizationName}</A>
              </>
            )}
            .
          </>
        )}
      </Paragraph>
    );
  }

  function topAccountLinks() {
    if (!customize.account) return;
    return (
      <div
        style={{
          textAlign: "center",
          margin: "30px 0 15px 0",
        }}
      >
        <Title level={1} style={{ color: COLORS.GRAY }}>
          Signed in as{" "}
          <A href="/config">
            {`${customize.account.first_name} ${customize.account.last_name} ${
              customize.account.name ? "(@" + customize.account.name + ")" : ""
            }`}
          </A>
        </Title>
        <Paragraph style={{ fontSize: "11pt", margin: "15px 0" }}>
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
          <A href={join(basePath, "projects")} external style={topLinkStyle}>
            Projects
          </A>{" "}
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
          <A href={"/config"} style={topLinkStyle}>
            Config
          </A>{" "}
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
            <A style={topLinkStyle} href="/info">
              Docs
            </A>
          </>
        </Paragraph>
      </div>
    );
  }

  function renderCoCalcComFeatures() {
    if (onCoCalcCom)
      return (
        <CoCalcComFeatures
          siteName={siteName ?? "CoCalc"}
          shareServer={shareServer ?? false}
          publicPaths={publicPaths}
          sandboxProjectId={sandboxProjectId}
        />
      );
  }

  function logo(): JSX.Element {
    return <Logo type="full" style={{ width: "50%" }} />;
  }

  function imageAlternative() {
    if (onCoCalcCom) {
      return (
        <div style={{ margin: "0 auto", textAlign: "center" }}>
          <Title level={3}>
            <A href="https://about.cocalc.com">
              Mission and Features of CoCalc
            </A>
          </Title>
          <Paragraph>
            <iframe
              style={{ marginTop: "30px" }}
              width="672"
              height="378"
              src="https://www.youtube.com/embed/ygVWdH4RKIQ"
              title="YouTube video player"
              frameBorder={0}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </Paragraph>
        </div>
      );
    } else {
      return indexInfo;
    }
  }

  return (
    <Customize value={customize}>
      <Head title={siteDescription ?? "Collaborative Calculation"} />
      <Layout>
        <Header />
        <Layout.Content style={{ backgroundColor: "white" }}>
          {topAccountLinks()}
          {shareServer && onCoCalcCom && <BannerWithLinks />}
          <Content
            style={{ minHeight: "30vh" }}
            logo={logo()}
            title={onCoCalcCom ? "" : siteName}
            subtitle={siteDescription}
            description={contentDescription()}
            image={splashImage ? splashImage : screenshot}
            alt={"Screenshot showing CoCalc in action!"}
            imageAlternative={imageAlternative()}
          />
          {renderCoCalcComFeatures()}
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const isAuthenticated = (await getAccountId(context.req)) != null;
  const pool = getPool("long");
  const { share_server } = await getServerSettings();
  let publicPaths;
  if (share_server) {
    const { rows } = await pool.query(
      `SELECT id, path, url, description, ${timeInSeconds("last_edited")},
    counter::INT,
     (SELECT COUNT(*)::INT FROM public_path_stars WHERE public_path_id=id) AS stars
    FROM public_paths
    WHERE vhost IS NULL AND disabled IS NOT TRUE AND unlisted IS NOT TRUE AND
    ((authenticated IS TRUE AND $1 IS TRUE) OR (authenticated IS NOT TRUE))
    ORDER BY stars DESC,last_edited DESC LIMIT $2`,
      [isAuthenticated, 150]
    );
    publicPaths = rows;
  } else {
    publicPaths = null;
  }

  return await withCustomize(
    { context, props: { publicPaths } },
    { name: true }
  );
}

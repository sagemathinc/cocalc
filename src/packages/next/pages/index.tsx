/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Layout } from "antd";
import { GetServerSidePropsContext } from "next";
import { join } from "path";
import { getRecentHeadlines } from "@cocalc/database/postgres/news";
import { Icon } from "@cocalc/frontend/components/icon";
import { RecentHeadline } from "@cocalc/util/types/news";
import { COLORS } from "@cocalc/util/theme";
import { CoCalcComFeatures, Hero } from "components/landing/cocalc-com-features";
import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { NewsBanner } from "components/landing/news-banner";
import { Paragraph, Title } from "components/misc";
import getAccountId from "lib/account/get-account";
import basePath from "lib/base-path";
import { Customize, CustomizeType } from "lib/customize";
import { PublicPath as PublicPathType } from "lib/share/types";
import withCustomize from "lib/with-customize";
import screenshot from "public/cocalc-screenshot-20200128-nq8.png";

import InPlaceSignInOrUp from "../components/auth/in-place-sign-in-or-up";
import Logo from "../components/logo";
import A from "../components/misc/A";

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
  } = customize;

  function renderCoCalcComFeatures() {
    if (!onCoCalcCom) return;
    return <CoCalcComFeatures />;
  }

  function landingBody(): JSX.Element|null {
    if (account) {
      return (
        <div
          style={{
            textAlign: "center",
            margin: "30px 0 15px 0",
          }}
        >
          <Logo type="full" style={{ width: "50%" }}/>
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
          <Title level={3} style={{ color: COLORS.GRAY, margin: "24px 0" }}>
            Signed in as{" "}
            <A href="/config">
              {`${account.first_name} ${account.last_name} ${
                account.name ? "(@" + account.name + ")" : ""
              }`}
            </A>
          </Title>
          <a href={join(basePath, "projects")}>
            <Button>
              <Icon name="edit"/> Launch Projects
            </Button>
          </a>
        </div>
      );
    }

    return (
      <InPlaceSignInOrUp
        title={`Get started with ${siteName}`}
        defaultView="sign-up"
      />
    );
  }

function imageAlternative() {
  if (onCoCalcCom) {
    return (
      <div style={{
        margin: "0 auto",
        textAlign: "center",
      }}>
        <Paragraph>
          <iframe
            style={{
              marginTop: "36px",
              maxWidth: "100%",
              boxShadow: "2px 2px 4px rgb(0 0 0 / 25%), 0 2px 4px rgb(0 0 0 / 22%)",
              borderRadius: "3px",
            }}
            width="672"
            height="378"
            src="https://www.youtube.com/embed/ygVWdH4RKIQ"
            title="YouTube video player"
            frameBorder={0}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
        </Paragraph>
        {siteDescription && (
          <h4 style={{ color: COLORS.GRAY_D, marginTop: "12px" }}>
            {siteDescription} with {siteName}
          </h4>
        )}
      </div>
      );
    } else {
      return indexInfo;
    }
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
          <Hero siteName={siteName} />
          <Content
            style={{ minHeight: "30vh" }}
            body={landingBody()}
            title={onCoCalcCom ? "" : siteName}
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

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const isAuthenticated = (await getAccountId(context.req)) != null;

  // get most recent headlines
  const recentHeadlines = await getRecentHeadlines(5);
  // we want not always show the same at the start
  const headlineIndex =
    recentHeadlines != null
      ? Math.floor(Date.now() % recentHeadlines.length)
      : 0;

  return await withCustomize(
    { context, props: { recentHeadlines, headlineIndex, isAuthenticated } },
    { name: true },
  );
}

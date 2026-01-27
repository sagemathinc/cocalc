/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Info from "components/landing/info";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

import screenshot from "public/features/api-screenshot.png";

const title = "API";

export default function API({ customize }) {
  const { siteName } = customize;
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header page="features" subPage="api" />
        <Layout.Content>
          <Content
            landing
            startup={siteName}
            title={title}
            body={<Icon name="api" style={{ fontSize: "60px" }} />}
            subtitle={
              <>
                Programmatically control CoCalc from your own server. Embed
                CoCalc within other products with a customized external look and
                feel.
              </>
            }
            image={screenshot}
            alt={"Using the API"}
          />
          <Info.Heading
            description={
              <>
                The documentation explains what you can do with the CoCalc API.
              </>
            }
          >
            <A href="https://doc.cocalc.com/api2/">CoCalc API Documentation</A>
          </Info.Heading>
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Paragraph, Text, Title } from "components/misc";
import A from "components/misc/A";
import { LinkToStore } from "components/store/link";
import { MAX_WIDTH } from "lib/config";
import { Customize, useCustomize } from "lib/customize";
import withCustomize from "lib/with-customize";

import type { JSX } from "react";

// internal link to the contact form
const URL_SUPPORT =
  "/support/new?type=purchase&subject=CoCalc%20Institutional&body=&title=Purchase%20Institutional%20License";

export default function Courses({ customize }) {
  const { siteName } = customize;
  return (
    <Customize value={customize}>
      <Head title={`${siteName} – Pricing – Institutional Licenses`} />
      <Layout>
        <Header page="pricing" subPage="institutions" />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <Body />
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

function Body(): JSX.Element {
  const { siteName } = useCustomize();

  return (
    <div
      style={{
        maxWidth: MAX_WIDTH,
        margin: "15px auto",
        padding: "15px",
        backgroundColor: "white",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <Title level={1}>
          <Icon name="home" style={{ marginRight: "30px" }} />
          CoCalc - Institutional Licenses
        </Title>
      </div>
      <Paragraph>
        The price of a {siteName} license is proportional to the{" "}
        <Text strong>number of active projects</Text> and the{" "}
        <Text strong>amount of resources</Text> allocated to each project.
      </Paragraph>
      <Paragraph>
        <Text strong>Number of active projects</Text>: You can assign a license
        to as many projects as you need. However, the run limit of the license
        is the upper bound to the number{" "}
        <Text italic>simultaneously running projects</Text>.
      </Paragraph>
      <Paragraph>
        Assuming each individual works on average in one project, the number of
        people who are actively using {siteName} at the very same time will be
        close to the number of active projects. Also, usually the number of
        actively running projects is well below the total number of people in
        your organization.
      </Paragraph>
      <Paragraph type="secondary">
        Note: if that run limit of simultaneously active projects is exceeded,
        those extra projects are still accessible, but will run without any
        upgrades.
      </Paragraph>
      <Paragraph>
        <Text strong>Amount of resources</Text>: minimal upgrades might be okay
        for day-to-day calculations and editing documents, but you will run into
        limitations if your requirements are higher. Please{" "}
        <A href={URL_SUPPORT}>contact us</A> if you have questions, or need a
        trial license to test out different options.
      </Paragraph>
      <Paragraph>
        <Text strong>Multiple license keys</Text>: You can also acquire several
        license keys for your institution. This means you can partition all
        users into smaller groups, each with their own license key. This is
        useful if you want to have distinct license keys for different
        departments, or if you want to have a license key for students and
        another one for faculty members. Additionally, you can also acquire an
        additional license for a shorter period of time, to cover periods of
        increased activity – e.g. final exams.
      </Paragraph>

      <Paragraph>
        <Text strong>After purchase</Text>: Once you have purchased a license
        key, you become a "license manager". This means you can pass that
        license key on to others, track their usage, and add other people as
        license managers.
      </Paragraph>

      <Alert
        icon={false}
        type="info"
        message={<Title level={3}>Contact us</Title>}
        description={
          <Paragraph>
            To learn more about institutional subscription options, please{" "}
            <A href={URL_SUPPORT}>
              contact us with a description of your specific requirements
            </A>
            .
          </Paragraph>
        }
      />
      <Paragraph style={{ textAlign: "center" }}>
        <LinkToStore />
      </Paragraph>
    </div>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout, List } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { LinkToStore } from "components/store/link";
import { MAX_WIDTH } from "lib/config";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

import type { JSX } from "react";

const FEATURES = [
  "Distribute assignments and collect submissions",
  "Track student progress in real time",
  "Collaborative help directly inside student work",
  "No local installs — everything runs in the browser",
];

export default function Courses({ customize }) {
  const { siteName } = customize;
  return (
    <Customize value={customize}>
      <Head title={`${siteName} – Pricing – Courses`} />
      <Layout>
        <Header page="pricing" subPage="courses" />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <Body />
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

function Body(): JSX.Element {
  return (
    <div style={{ maxWidth: MAX_WIDTH, margin: "auto", padding: "20px 0" }}>
      <Title level={2}>Courses</Title>
      <Paragraph>
        Teaching with CoCalc makes course management effortless. Students work
        in their own secure spaces, while instructors can provide help and
        feedback directly in context.
      </Paragraph>
      <List
        dataSource={FEATURES}
        renderItem={(item) => (
          <List.Item>
            <Icon name="check" style={{ marginRight: "8px" }} /> {item}
          </List.Item>
        )}
      />
      <Paragraph style={{ marginTop: "20px" }}>
        Memberships cover workspace resources for teaching and research. For
        course-wide pricing or invoicing, please <A href="/support/new">contact
        support</A>.
      </Paragraph>
      <LinkToStore label="View Memberships" />
    </div>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

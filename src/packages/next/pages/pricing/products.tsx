/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout, Typography } from "antd";

import { Icon, PAYASYOUGO_ICON } from "@cocalc/frontend/components/icon";
import {
  WORKSPACE_LABEL,
  WORKSPACES_LABEL,
} from "@cocalc/util/i18n/terminology";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { MAX_WIDTH } from "lib/config";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

import type { JSX } from "react";

const { Text } = Typography;

export default function Products({ customize }) {
  const { siteName } = customize;
  return (
    <Customize value={customize}>
      <Head title={`${siteName} – Product Pricing`} />
      <Layout>
        <Header page="pricing" subPage="products" />
        <Layout.Content
          style={{
            backgroundColor: "white",
          }}
        >
          <Body siteName={siteName} />
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

function Body({ siteName }): JSX.Element {
  return (
    <div
      style={{
        maxWidth: MAX_WIDTH,
        margin: "15px auto",
        padding: "15px",
        backgroundColor: "white",
      }}
    >
      <Title level={1} style={{ textAlign: "center" }}>
        <Icon name="credit-card" style={{ marginRight: "30px" }} /> CoCalc –
        Products
      </Title>

      <Title level={2}>
        <Icon name="edit" /> {siteName} {WORKSPACES_LABEL}
      </Title>
      <Paragraph>
        Your work on <span>{siteName}</span> happens inside one or more{" "}
        <A href="https://doc.cocalc.com/project.html">
          {WORKSPACES_LABEL.toLowerCase()}
        </A>
        . They form your personal workspaces, where you privately store your
        files,
        computational worksheets, and data. You typically run computations
        through a web browser, either via a{" "}
        <A href="https://doc.cocalc.com/sagews.html">Sage Worksheet</A>,{" "}
        <A href="https://doc.cocalc.com/jupyter.html">Jupyter Notebook</A>, or
        by executing a program in a{" "}
        <A href="https://doc.cocalc.com/terminal.html">terminal</A>. You can
        also{" "}
        <A href="https://doc.cocalc.com/project-settings.html#add-new-collaborators">
          invite collaborators
        </A>{" "}
        to work with you inside a {WORKSPACE_LABEL.toLowerCase()}, and you can
        explicitly make files or directories{" "}
        <A href="https://doc.cocalc.com/share.html">
          publicly available to everybody
        </A>
        .
      </Paragraph>

      <Title level={2}>
        <Icon name="gears" /> Upgrading {WORKSPACES_LABEL}
      </Title>
      <Paragraph>
        By default, a{" "}
        <A href="https://doc.cocalc.com/trial.html">
          {WORKSPACE_LABEL.toLowerCase()} without upgrades
        </A>{" "}
        has no internet access, less CPU power, and only a small amount of RAM.
        Purchasing a license and{" "}
        <A href="https://doc.cocalc.com/project-settings.html#add-a-license-to-a-project">
          assigning it to a {WORKSPACE_LABEL.toLowerCase()}
        </A>{" "}
        improves hosting quality ("
        <A href={"https://doc.cocalc.com/upgrades.html#upg-mhost"}>
          member hosting
        </A>
        "), enables internet access from within a{" "}
        {WORKSPACE_LABEL.toLowerCase()} and increases quotas for CPU and RAM.
        This allows you to work on larger problems and do more computations
        simultaneously. On top of that, your{" "}
        <A href="mailto:help@cocalc.com">support questions</A> are prioritized.
      </Paragraph>
      <Paragraph>
        All {WORKSPACE_LABEL.toLowerCase()} collaborators{" "}
        <em>collectively contribute</em> to the same{" "}
        {WORKSPACE_LABEL.toLowerCase()} — their contributions benefit all{" "}
        {WORKSPACE_LABEL.toLowerCase()} collaborators equally.
      </Paragraph>

      <Title level={2}>
        <Icon name="key" /> License Keys
      </Title>
      <Paragraph>
        <A href="https://doc.cocalc.com/licenses.html">License Keys</A> are
        applied to {WORKSPACES_LABEL.toLowerCase()}. One license key can upgrade
        up to a certain number of{" "}
        <b>simultaneously running {WORKSPACES_LABEL.toLowerCase()}</b> with the
        given upgrade schema. You can apply a single license key to an
        unlimited number of {WORKSPACES_LABEL.toLowerCase()}.
      </Paragraph>
      <Paragraph>
        The following parameters determine the price:
        <ul style={{ paddingLeft: "20px" }}>
          <li>The number of {WORKSPACES_LABEL.toLowerCase()}</li>
          <li>If you qualify for an academic discount</li>
          <li>
            Upgrade schema per {WORKSPACE_LABEL.toLowerCase()}: a small 2 GB
            memory / 1 shared CPU upgrade is fine for basic calculations, but
            we find that many data and computational science workloads run
            better with additional RAM and CPU.
          </li>
          <li>
            Duration: monthly/yearly subscription or explicit start and end
            dates.
          </li>
          <li>
            Purchase method: online self-service purchasing versus a purchase
            order (which may require customized terms of service, wire
            transfers, etc.)
          </li>
        </ul>
      </Paragraph>

      <Title level={2}>
        <Icon name="graduation-cap" /> Teaching Courses
      </Title>
      <Paragraph>
        Teaching a course on CoCalc usually involves one{" "}
        <Text italic>instructor {WORKSPACE_LABEL.toLowerCase()}</Text> hosting
        the course and one {WORKSPACE_LABEL.toLowerCase()} for each student.
        Additionally, a shared {WORKSPACE_LABEL.toLowerCase()} could be set up
        as a common space.
      </Paragraph>
      <Paragraph>
        Essentially, either you or your institution purchases a license key to
        cover all involved {WORKSPACES_LABEL.toLowerCase()}, or you configure
        your course in such a way that all students have to purchase an upgrade
        for their {WORKSPACES_LABEL.toLowerCase()} on their own. Please check
        out{" "}
        <Text strong>
          <A href="./courses">course licenses</A>
        </Text>{" "}
        for more details.
      </Paragraph>

      <Title level={2}>
        <Icon name={PAYASYOUGO_ICON} /> Pay As You Go Upgrades
      </Title>
      <Paragraph>
        Alternatively, without committing to a full license and an ongoing
        subscription, you can upgrade a {WORKSPACE_LABEL.toLowerCase()} just
        for the period of time when you actually use it. You are only charged
        for the time when the {WORKSPACE_LABEL.toLowerCase()} is actually
        running. You can tweak the resource configuration any time you are
        about to start the {WORKSPACE_LABEL.toLowerCase()}.
      </Paragraph>
      <Paragraph>
        Learn more about{" "}
        <A href={"https://doc.cocalc.com/paygo.html"}>Pay As You Go Upgrades</A>{" "}
        in our documentation.
      </Paragraph>

      <Title level={2}>
        <Icon name="network-wired" /> On-Premises
      </Title>
      <Paragraph>
        It's also possible to run {siteName} on your own hardware. Please see{" "}
        <A href={"./onprem"}>on premises licenses options</A> for more
        information.
      </Paragraph>

      <Title level={2}>Frequently Asked Questions</Title>
      <Paragraph>
        <A id="faq"></A>
        <ul style={{ paddingLeft: "20px" }}>
          <li>
            <A href="https://doc.cocalc.com/billing.html">
              Billing, quotas, and upgrades FAQ
            </A>
          </li>
          <li>
            <A href="https://doc.cocalc.com/project-faq.html">
              {WORKSPACES_LABEL} FAQ
            </A>
          </li>
        </ul>
      </Paragraph>
    </div>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

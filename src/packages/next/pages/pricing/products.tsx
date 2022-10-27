/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components/icon";
import { Layout, Typography } from "antd";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import A from "components/misc/A";
import { MAX_WIDTH } from "lib/config";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

const { Text } = Typography;

export default function Products({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Products" />
      <Header page="pricing" subPage="products" />
      <Layout.Content
        style={{
          backgroundColor: "white",
        }}
      >
        <Body />
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

function Body(): JSX.Element {
  return (
    <div
      style={{
        maxWidth: MAX_WIDTH,
        margin: "15px auto",
        padding: "15px",
        backgroundColor: "white",
      }}
    >
      <div style={{ textAlign: "center", color: "#444" }}>
        <h1 style={{ fontSize: "28pt" }}>
          <Icon name="credit-card" style={{ marginRight: "30px" }} /> CoCalc -
          Products
        </h1>
      </div>
      <div style={{ fontSize: "12pt" }}>
        <h2>Collaborative projects</h2>
        <p>
          Your work on <span>CoCalc</span> happens inside one or more{" "}
          <A href="https://doc.cocalc.com/project.html">projects</A>. They form
          your personal workspaces, where you privately store your files,
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
          to work with you inside a project, and you can explicitly make files
          or directories{" "}
          <A href="https://doc.cocalc.com/share.html">
            publicly available to everybody
          </A>
          .
        </p>

        <h2>Teaching Courses</h2>
        <p>
          Teaching a course on CoCalc usually involves one{" "}
          <Text italic>instructor project</Text> hosting the course and one
          project for each student. Additionally, a shared project could be set
          up as a common space. Please check out{" "}
          <Text strong>
            <A href="./courses">course licenses</A>
          </Text>{" "}
          for more details.
        </p>

        <h2>Project resources</h2>
        <p>
          Each project runs on a server, where it shares disk space, CPU, and
          RAM with other projects. Initially, you work in a{" "}
          <A href="https://doc.cocalc.com/trial.html">trial project</A>, which
          runs with default quotas on heavily used machines that are rebooted
          frequently. Upgrading to "member hosting" moves your project to a
          machine with higher-quality hosting and less competition for
          resources.
        </p>

        <h2>Upgrading projects</h2>
        <p>
          Each license you purchase provides upgrades to the project{" "}
          <A href="https://doc.cocalc.com/project-settings.html#add-a-license-to-a-project">
            the license is assigned to
          </A>
          . This improves hosting quality, enables internet access from within a
          project or increases quotas for CPU and RAM in order to work on larger
          problems and do more computations simultaneously. On top of that, your{" "}
          <A href="mailto:help@cocalc.com">support questions</A> are
          prioritized.
        </p>
        <p>
          All project collaborators <em>collectively contribute</em> to the same
          project — their contributions benefit all project collaborators
          equally.
        </p>

        <h2>License Keys</h2>
        <p>
          <A href="https://doc.cocalc.com/licenses.html">License Keys</A> are
          applied to projects. One license key can upgrade up to a certain
          number of <b>simultaneously running projects</b> with the given
          upgrade schema. You can apply a single license key to an unlimited
          number of projects.
        </p>
        <p>The following parameters determine the price:</p>
        <ul style={{ paddingLeft: "20px" }}>
          <li>The number of projects</li>
          <li>If you qualify for an academic discount</li>
          <li>
            Upgrade schema per project: a small 2 GB memory / 1 shared CPU
            upgrade is fine for basic calculations, but we find that many data
            and computational science projects run better with additional RAM
            and CPU.
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

        <h2>Frequently Asked Questions</h2>
        <div>
          <A id="faq"></A>
          <ul style={{ paddingLeft: "20px" }}>
            <li>
              <A href="https://doc.cocalc.com/billing.html">
                Billing, quotas, and upgrades FAQ
              </A>
            </li>
            <li>
              <A href="https://doc.cocalc.com/project-faq.html">Projects FAQ</A>
            </li>
          </ul>
        </div>

        <h2>On premises</h2>
        <div>
          It's also possible to run CoCalc on your own hardware. Please see{" "}
          <A href={"./onprem"}>on premises options</A> for more information.
        </div>
      </div>
    </div>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

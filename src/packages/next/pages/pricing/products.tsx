import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Layout } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import { Icon } from "@cocalc/frontend/components/icon";
import A from "components/misc/A";
import { MAX_WIDTH } from "lib/config";

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
              <Icon name="credit-card" style={{ marginRight: "30px" }} /> CoCalc
              - Products
            </h1>
          </div>
          <div style={{ fontSize: "12pt" }}>
            <p>
              Initially, you start using CoCalc under a{" "}
              <A href="https://doc.cocalc.com/trial.html">free trial plan</A> in
              order to test out the service. If CoCalc works for you, please
              purchase a license.
            </p>
            <p>
              You can{" "}
              <A href="/store/site-license">
                <strong>purchase a license in the store</strong>
              </A>
              .
            </p>
            <p>
              Any subscription or{" "}
              <A href="https://doc.cocalc.com/account/licenses.html">
                license upgrade
              </A>{" "}
              must be{" "}
              <A href="https://doc.cocalc.com/project-settings.html#project-usage-and-quotas">
                applied explicitly to your project
              </A>{" "}
              or{" "}
              <A href="https://doc.cocalc.com/teaching-notes.html#site-license-course-setup">
                distributed to student projects
              </A>
              .
            </p>
            <p>
              Listed prices are in <b>US dollars</b>. When charging in local
              currency, the prices are converted into local currency using the
              conversion rates published by leading financial institutions.{" "}
            </p>
            <br />

            <h2>Questions</h2>
            <p>
              Please immediately email us at{" "}
              <A href="mailto:help@cocalc.com">help@cocalc.com</A> if anything
              is unclear to you. Also, contact us if you need customized{" "}
              <A href="/pricing/courses">course packages</A>, modified{" "}
              <A href="/policies/terms">terms of service</A>, additional{" "}
              <A href="/policies/privacy">legal</A>{" "}
              <A href="/policies/ferpa">agreements</A>, purchase orders or
              priority technical support.
            </p>
            <br />

            <h2>Projects</h2>
            <p>
              Your work on <span>CoCalc</span> happens inside one or more{" "}
              <A href="https://doc.cocalc.com/project.html">projects</A>. They
              form your personal workspaces, where you privately store your
              files, computational worksheets, and data. You typically run
              computations through a web browser, either via a{" "}
              <A href="https://doc.cocalc.com/sagews.html">Sage Worksheet</A>,{" "}
              <A href="https://doc.cocalc.com/jupyter.html">Jupyter Notebook</A>
              , or by executing a program in a{" "}
              <A href="https://doc.cocalc.com/terminal.html">terminal</A>. You
              can also{" "}
              <A href="https://doc.cocalc.com/project-settings.html#add-new-collaborators">
                invite collaborators
              </A>{" "}
              to work with you inside a project, and you can explicitly make
              files or directories{" "}
              <A href="https://doc.cocalc.com/share.html">
                publicly available to everybody
              </A>
              .
            </p>

            <br />
            <h2>Shared Resources</h2>
            <p>
              Each project runs on a server, where it shares disk space, CPU,
              and RAM with other projects. Initially, you work in a{" "}
              <A href="https://doc.cocalc.com/trial.html">trial project</A>,
              which runs with default quotas on heavily used machines that are
              rebooted frequently. Upgrading to "member hosting" moves your
              project to a machine with higher-quality hosting and less
              competition for resources.
            </p>

            <h2>Upgrading Projects</h2>
            <p>
              By purchasing one or more of our subscriptions or plans, you
              receive a certain amount of{" "}
              <A href="https://doc.cocalc.com/billing.html#quota-upgrades">
                quota upgrades
              </A>
              . Use these upgrades to improve hosting quality, enable internet
              access from within a project or increase quotas for CPU and RAM in
              order to work on larger problems and do more computations
              simultaneously. On top of that, your{" "}
              <A href="mailto:help@cocalc.com">support questions</A> are
              prioritized.
            </p>
            <p>
              All project collaborators <em>collectively contribute</em> to the
              same project — their contributions benefit all project
              collaborators equally.
            </p>

            <br />
            <h2>License Keys</h2>
            <p>
              <A href="https://doc.cocalc.com/licenses.html">License Keys</A>{" "}
              are applied to projects. One license key can upgrade up to a
              certain number of <b>simultaneously running projects</b> with the
              given upgrade schema. You can apply a single license key to an
              unlimited number of projects.
            </p>
            <p>
              The following parameters determine the price:
              <ul style={{ paddingLeft: "20px" }}>
                <li>The number of projects</li>
                <li>If you qualify for an academic discount</li>
                <li>
                  Upgrade schema per project: a small 1 GB memory / 1 shared CPU
                  upgrade is fine for basic calculations, but we find that many
                  data and computational science projects run better with
                  additional RAM and CPU.
                </li>
                <li>
                  Duration: monthly/yearly subscription or explicit start and
                  end dates.
                </li>
                <li>
                  Purchase method: online self-service purchasing versus a
                  purchase order (which may require customized terms of service,
                  wire transfers, etc.)
                </li>
              </ul>
            </p>

            <br />
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
                  <A href="https://doc.cocalc.com/project-faq.html">
                    Projects FAQ
                  </A>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

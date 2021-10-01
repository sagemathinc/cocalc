import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Alert, Layout, List } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import A from "components/misc/A";
import PricingItem, { Line } from "components/landing/pricing-item";

interface Item {
  title: string;
  icon: IconName;
  projects: number;
  disk: number;
  shared_ram: number;
  dedicated_ram?: number;
  shared_cores: number;
  dedicated_cores?: number;
  academic?: boolean;
  monthly?: number;
  yearly?: number;
}

const data: Item[] = [
  {
    title: "Hobbyist",
    icon: "battery-quarter",
    projects: 2,
    shared_ram: 1,
    shared_cores: 1,
    disk: 1,
    dedicated_ram: 0,
    dedicated_cores: 0,
    academic: true,
    monthly: 6.15,
    yearly: 69.65,
  },
  {
    title: "Academic Researcher Group",
    icon: "battery-half",
    projects: 7,
    shared_ram: 5,
    dedicated_ram: 1,
    shared_cores: 2,
    disk: 10,
    dedicated_cores: 0,
    academic: true,
    monthly: 73.36,
    yearly: 831.36,
  },
  {
    title: "Business Working Group",
    icon: "battery-full",
    projects: 3,
    shared_ram: 3,
    shared_cores: 1,
    disk: 5,
    dedicated_ram: 0,
    dedicated_cores: 1,
    academic: false,
    monthly: 157.85,
    yearly: 1788.95,
  },
];

export default function Subscriptions({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Subscriptions" />
      <Header page="pricing" subPage="subscriptions" />
      <Layout.Content
        style={{
          backgroundColor: "white",
        }}
      >
        <div
          style={{
            maxWidth: "900px",
            margin: "15px auto",
            padding: "15px",
            backgroundColor: "white",
          }}
        >
          <div style={{ textAlign: "center", color: "#444" }}>
            <h1 style={{ fontSize: "28pt" }}>
              <Icon name="calendar" style={{ marginRight: "30px" }} /> CoCalc -
              Subscriptions
            </h1>
          </div>
          <div style={{ fontSize: "12pt" }}>
            <a id="subscriptions"></a>
            <p>
              A subscription provides you with a{" "}
              <A href="https://doc.cocalc.com/licenses.html">license key</A> for{" "}
              <A href="https://doc.cocalc.com/project-settings.html#licenses">
                upgrading your projects
              </A>{" "}
              or other projects where you are a collaborator — everyone using an
              upgraded project benefits equally. Such a subscription{" "}
              <b>automatically renews</b> at the end of each period. You can{" "}
              <b>cancel at any time</b>.
            </p>
            <Alert
              style={{ margin: "15px 0" }}
              message="Dedicated Virtual Machines"
              description={
                <span style={{ fontSize: "11pt" }}>
                  For more intensive workloads you can also rent a{" "}
                  <A href="/pricing/dedicated">
                    dedicated virtual machine or disk
                  </A>
                  .
                </span>
              }
              type="info"
              showIcon
            />
            <h2>Examples</h2>
            <p>
              We list three typical configurations below. All parameters can be
              adjusted to fit your needs. Listed upgrades are for each project.
              Exact prices may vary. Below $100, only online purchases are
              available (no purchase orders). Subscriptions receive a 10%
              discount for monthly and 15% for yearly periods.
            </p>
            <List
              grid={{ gutter: 16, column: 3, xs: 1, sm: 1 }}
              dataSource={data}
              renderItem={(item) => (
                <PricingItem title={item.title} icon={item.icon}>
                  <Line amount={item.projects} desc="Projects" />
                  <Line
                    amount={item.shared_ram}
                    desc="Shared RAM per project"
                  />
                  <Line
                    amount={item.shared_cores}
                    desc="Shared CPU per project"
                  />
                  <Line amount={item.disk} desc="Disk space per project" />
                  <Line
                    amount={item.dedicated_ram}
                    desc="Dedicated RAM per project"
                  />
                  <Line
                    amount={item.dedicated_cores}
                    desc="Dedicated CPU per project"
                  />
                  <Line amount={"Unlimited"} desc="Collaborators" />
                  {item.academic ? (
                    <Line amount="40%" desc="Academic discount" />
                  ) : (
                    <Line amount="" desc="" />
                  )}

                  <br />
                  <br />
                  <div>
                    <span
                      style={{
                        fontWeight: "bold",
                        fontSize: "18pt",
                        color: "#555",
                      }}
                    >
                      ${item.monthly}
                    </span>{" "}
                    / month
                  </div>
                  <div>
                    <span
                      style={{
                        fontWeight: "bold",
                        fontSize: "18pt",
                        color: "#555",
                      }}
                    >
                      ${item.yearly}
                    </span>{" "}
                    / year
                  </div>
                </PricingItem>
              )}
            />
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

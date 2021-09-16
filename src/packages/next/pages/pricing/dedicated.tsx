import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Layout } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import A from "components/misc/A";
import { List } from "antd";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import PricingItem, { Line } from "components/landing/pricing-item";

interface Item {
  title: string;
  icon: IconName;
  disk: number;
  ram: number;
  cores: number;
  price: number;
}

const data: Item[] = [
  {
    title: "Dedicated VM (small)",
    icon: "battery-quarter",
    disk: 200,
    ram: 15,
    cores: 4,
    price: 199,
  },
  {
    title: "Dedicated VM (medium)",
    icon: "battery-half",
    disk: 400,
    ram: 52,
    cores: 8,
    price: 499,
  },
  {
    title: "Dedicated VM (large)",
    icon: "battery-full",
    disk: 600,
    ram: 104,
    cores: 16,
    price: 999,
  },
];

export default function Products({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Dedicated Virtual Machines" />
      <Header page="pricing" subPage="dedicated" />
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
              <Icon name="server" style={{ marginRight: "30px" }} /> CoCalc -
              Dedicated Virtual Machines
            </h1>
          </div>
          <div style={{ fontSize: "12pt" }}>
            <p>
              A <b>Dedicated VM</b> is a specific node in our cluster, which
              solely hosts one or more of your projects. This allows you to run
              much larger workloads with consistent performance, because no
              resources are shared with other projects and your machine can be{" "}
              <b>much</b> larger than any of our generic machines. The usual
              quota limitations do not apply and you can also rent additional
              disk space or SSD's.
            </p>
            <p>
              To get started, please contact us at{" "}
              <A href="mailto:help@cocalc.com">help@cocalc.com</A>. We will work
              out the actual requirements with you and set everything up. The
              list of dedicated VM options below are just examples; we can
              provide VM's with almost any configuration{" "}
              <A href="https://cloud.google.com/compute/docs/machine-types">
                that Google Cloud offers:
              </A>{" "}
              <b>up to 224 CPUs, 12 TB of RAM, and 64TB disk space!</b>
            </p>
            <br />
            <List
              grid={{ gutter: 16, column: 3, xs: 1, sm: 1 }}
              dataSource={data}
              renderItem={(item) => (
                <PricingItem title={item.title} icon={item.icon}>
                  <Line amount={item.disk} desc="Disk space" />
                  <Line amount={item.ram} desc="Dedicated RAM" />
                  <Line amount={item.cores} desc="Dedicated CPU" />
                  <br />
                  <br />
                  <span
                    style={{
                      fontWeight: "bold",
                      fontSize: "18pt",
                      color: "#666",
                    }}
                  >
                    ${item.price}/month
                  </span>
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

export async function getServerSideProps() {
  return await withCustomize();
}

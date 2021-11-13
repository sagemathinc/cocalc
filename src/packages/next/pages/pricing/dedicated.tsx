/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

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

const VM_CONFIGS: Item[] = [
  {
    title: "Dedicated VM (small)",
    icon: "battery-quarter",
    ram: 15,
    cores: 4,
    price: 199,
  },
  {
    title: "Dedicated VM (medium)",
    icon: "battery-half",
    ram: 52,
    cores: 8,
    price: 499,
  },
  {
    title: "Dedicated VM (large)",
    icon: "battery-full",
    ram: 104,
    cores: 16,
    price: 999,
  },
] as const;

const DISK_CONFIGS: Item[] = [] as const;

export default function Products({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Dedicated Resources" />
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
              Dedicated Resources
            </h1>
          </div>
          <div style={{ fontSize: "12pt" }}>
            <h2><strong>Dedicated VMs</strong></h2>
            <p>
              Upgrade one of your projects to run on a <b>Dedicated VM</b>. This
              is an additional node in CoCalc's cluster, where no resources are
              shared with other projects. That machine can be <b>much</b> larger
              than any of our generic machines as well. This allows you to run
              much more intensive workloads with consistent performance, because
              the usual quota limitations do not apply. You can also rent
              additional disk space for faster additional storage.
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
              <b>up to 224 CPUs and 12 TB of RAM!</b>
            </p>
            <br />
            <List
              grid={{ gutter: 16, column: 3, xs: 1, sm: 1 }}
              dataSource={VM_CONFIGS}
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
            <br />
            <h2><strong>Dedicated Disks</strong></h2>
            <p>
              A <strong>Dedicated Disk</strong> is an additional storage device mounted into your project.
            </p>
            <p>
              Up to <strong>64TB disk space</strong>.
            </p>
            <List
              grid={{ gutter: 16, column: 3, xs: 1, sm: 1 }}
              dataSource={DISK_CONFIGS}
              renderItem={(item) => (
                <PricingItem title={item.title} icon={item.icon}>
                  <Line amount={item.disk} desc="Disk space" />
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

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

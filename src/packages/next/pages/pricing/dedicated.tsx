/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Layout, Typography } from "antd";
const { Text } = Typography;
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import A from "components/misc/A";
import { List } from "antd";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import PricingItem, { Line } from "components/landing/pricing-item";
import { PRICES } from "@cocalc/util/upgrades/dedicated";
import { AVG_MONTH_DAYS } from "@cocalc/util/consts/billing";

interface Item {
  title: string;
  icon: IconName;
  disk?: number;
  ram?: number;
  cores?: number;
  price: number;
  iops?: string;
  mbps?: string;
}

const ICONS: IconName[] = [
  "battery-empty",
  "battery-quarter",
  "battery-half",
  "battery-full",
];

const VMS = [
  PRICES.vms["n2-highmem-2"],
  PRICES.vms["n2-standard-4"],
  PRICES.vms["n2-highmem-8"],
  PRICES.vms["n2-standard-16"],
];

const VM_CONFIGS: Item[] = ICONS.map((battery, idx) => {
  const vm = VMS[idx];
  if (vm == null) throw new Error("this should never happen");
  return {
    title: `Example ${idx + 1}`,
    icon: battery,
    ram: vm.spec.mem,
    cores: vm.spec.cpu,
    price: Math.round(vm.price_day * AVG_MONTH_DAYS),
  };
});

const disk_configs = [
  PRICES.disks["128-standard"],
  PRICES.disks["128-balanced"],
  PRICES.disks["128-ssd"],
];

const DISK_CONFIGS: Item[] = ICONS.slice(1).map((battery, idx) => {
  const dc = disk_configs[idx];
  if (dc == null) throw new Error("this should never happen");
  return {
    title: dc.title,
    icon: battery,
    disk: dc.quota.dedicated_disk.size_gb,
    price: Math.round(AVG_MONTH_DAYS * dc.price_day),
    iops: dc.iops,
    mbps: dc.mbps,
  };
});

export default function Products({ customize }) {
  const { siteName } = customize;
  return (
    <Customize value={customize}>
      <Head title={"Dedicated virtual machines and disks"} />
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
              <Icon name="server" style={{ marginRight: "30px" }} /> Dedicated
              VMs and Disks
            </h1>
          </div>
          <div style={{ fontSize: "12pt" }}>
            <h2>
              <strong>Dedicated Virtual Machines</strong>
            </h2>
            <p>
              Upgrade one of your projects to run on a <b>Dedicated VM</b>. This
              is an additional node in {siteName}'s cluster, where no resources
              are shared with other projects. That machine can be <b>much</b>{" "}
              larger than any of our generic machines as well. This allows you
              to run much more intensive workloads with consistent performance,
              because the usual quota limitations do not apply. You can also
              rent additional disk space for faster additional storage.
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
              grid={{ gutter: 16, column: 4, xs: 1, sm: 1 }}
              dataSource={VM_CONFIGS}
              renderItem={(item) => (
                <PricingItem title={item.title} icon={item.icon}>
                  <Line amount={item.cores} desc="CPU" />
                  <Line amount={item.ram} desc="RAM" />
                  <br />
                  <br />
                  <Text strong style={{ fontSize: "18pt" }}>
                    ${item.price}/month
                  </Text>
                </PricingItem>
              )}
            />
            <br />
            <h2>
              <strong>Dedicated Disks</strong>
            </h2>
            <p>
              A <strong>Dedicated Disk</strong> is an additional storage device
              mounted into your project. Their{" "}
              <A href="https://cloud.google.com/compute/docs/disks/performance">
                speed
              </A>{" "}
              ranges from traditional spinning disks with a rather slow number
              of operations per second up to fast SSD disks. You do not need to
              rent a Dedicated VM in order to subscribe to a Dedicated Disk.
            </p>
            <p>
              The list of dedicated disk options below are just exmples. Usual
              disk sizes are <strong>64, 128 and 256 GB</strong>, but we could
              provide disks{" "}
              <A href="https://cloud.google.com/compute/docs/disks/performance">
                that GCP offers
              </A>{" "}
              with up to 64TB of disk space.
            </p>
            <p>
              <Text strong>Note:</Text> When the subscription ends, all data
              stored on such a disk will be deleted!
            </p>
            <List
              grid={{ gutter: 16, column: 3, xs: 1, sm: 1 }}
              dataSource={DISK_CONFIGS}
              renderItem={(item) => (
                <PricingItem title={item.title} icon={item.icon}>
                  <Line amount={item.disk} desc="Disk space" />
                  <Line amount={"regular"} desc="Snapshots" />
                  <Line amount={item.iops} desc="IOPS r/w" />
                  <Line amount={item.mbps} desc="MBps r/w" />
                  <br />
                  <br />
                  <Text strong style={{ fontSize: "18pt" }}>
                    ${item.price}/month
                  </Text>
                </PricingItem>
              )}
            />
            <p>
              <Icon name="info-circle" /> To ease data transfer, make sure to
              check out how to mount{" "}
              <A href="https://doc.cocalc.com/project-settings.html#cloud-storage-remote-file-systems">
                cloud storage or remote file-systems
              </A>{" "}
              into your project as well.
            </p>
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

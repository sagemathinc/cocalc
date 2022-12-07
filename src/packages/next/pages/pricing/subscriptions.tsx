/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { LicenseIdleTimeouts } from "@cocalc/util/consts/site-license";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import {
  discount_monthly_pct,
  discount_yearly_pct,
  MIN_QUOTE,
} from "@cocalc/util/licenses/purchase/consts";
import { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import { money } from "@cocalc/util/licenses/purchase/utils";
import { COLORS } from "@cocalc/util/theme";
import { Alert, Layout, List } from "antd";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import PricingItem, { Line } from "components/landing/pricing-item";
import A from "components/misc/A";
import { LinkToStore, StoreConf } from "components/store/link";
import { MAX_WIDTH } from "lib/config";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import {
  applyLicense,
  listedPrices,
  pricingQuestions,
} from "components/share/pricing";

interface Item {
  title: string;
  icon: IconName;
  projects: number;
  disk: number;
  shared_ram: number;
  shared_cores: number;
  academic?: boolean;
  uptime?: string;
  monthly: number;
  yearly: number;
  conf: StoreConf;
}

const hobby: Item = (() => {
  const conf = {
    run_limit: 2,
    disk: 3,
    ram: 2,
    cpu: 1,
    uptime: "short",
    user: "academic",
  } as const;

  const info: PurchaseInfo = {
    type: "quota",
    user: conf.user,
    upgrade: "custom",
    quantity: conf.run_limit,
    subscription: "monthly",
    start: new Date(),
    custom_ram: conf.ram,
    custom_cpu: conf.cpu,
    custom_disk: conf.disk,
    custom_member: true,
    custom_dedicated_ram: 0,
    custom_dedicated_cpu: 0,
    custom_uptime: conf.uptime,
  };

  const priceM = compute_cost(info);
  const priceY = compute_cost({ ...info, subscription: "yearly" });

  return {
    title: "Hobbyist",
    icon: "battery-quarter",
    projects: conf.run_limit,
    shared_ram: conf.ram,
    shared_cores: conf.cpu,
    disk: conf.disk,
    academic: true,
    uptime: LicenseIdleTimeouts[conf.uptime].labelShort,
    monthly: priceM.discounted_cost,
    yearly: priceY.discounted_cost,
    conf,
  };
})();

const academic: Item = (() => {
  const conf = {
    run_limit: 3,
    disk: 10,
    ram: 5,
    cpu: 2,
    uptime: "day",
    user: "academic",
  } as const;

  const info: PurchaseInfo = {
    type: "quota",
    user: conf.user,
    upgrade: "custom",
    quantity: conf.run_limit,
    subscription: "monthly",
    start: new Date(),
    custom_ram: conf.ram,
    custom_cpu: conf.cpu,
    custom_disk: conf.disk,
    custom_member: true,
    custom_dedicated_ram: 0,
    custom_dedicated_cpu: 0,
    custom_uptime: conf.uptime,
  };

  const priceM = compute_cost(info);
  const priceY = compute_cost({ ...info, subscription: "yearly" });

  return {
    title: "Academic Researcher Group",
    icon: "battery-half",
    projects: conf.run_limit,
    shared_ram: conf.ram,
    shared_cores: conf.cpu,
    disk: conf.disk,
    dedicated_cores: 0,
    academic: true,
    uptime: LicenseIdleTimeouts[conf.uptime].labelShort,
    monthly: priceM.discounted_cost,
    yearly: priceY.discounted_cost,
    conf,
  };
})();

const business: Item = (() => {
  const conf = {
    run_limit: 5,
    disk: 5,
    ram: 4,
    cpu: 1,
    uptime: "medium",
    user: "business",
  } as const;

  const info: PurchaseInfo = {
    type: "quota",
    user: conf.user,
    upgrade: "custom",
    quantity: conf.run_limit,
    subscription: "monthly",
    start: new Date(),
    custom_ram: conf.ram,
    custom_cpu: conf.cpu,
    custom_disk: conf.disk,
    custom_member: true,
    custom_dedicated_ram: 0,
    custom_dedicated_cpu: 0,
    custom_uptime: conf.uptime,
  };

  const priceM = compute_cost(info);
  const priceY = compute_cost({ ...info, subscription: "yearly" });

  return {
    title: "Business Working Group",
    icon: "battery-full",
    projects: conf.run_limit,
    shared_ram: conf.ram,
    shared_cores: conf.cpu,
    disk: conf.disk,
    academic: false,
    uptime: LicenseIdleTimeouts[conf.uptime].labelShort,
    monthly: priceM.discounted_cost,
    yearly: priceY.discounted_cost,
    conf,
  };
})();

const data: Item[] = [hobby, academic, business];

function dedicated(): JSX.Element {
  return (
    <Alert
      style={{ margin: "15px 0" }}
      message="Dedicated Virtual Machines"
      description={
        <span style={{ fontSize: "11pt" }}>
          For more intensive workloads you can also rent a{" "}
          <A href="/pricing/dedicated">dedicated virtual machine or disk</A>.
        </span>
      }
      type="info"
      showIcon
    />
  );
}

export default function Subscriptions({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Subscriptions" />
      <Layout>
        <Header page="pricing" subPage="subscriptions" />
        <Layout.Content
          style={{
            backgroundColor: "white",
          }}
        >
          <Body />
          <Footer />
        </Layout.Content>
      </Layout>
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
          <Icon name="calendar" style={{ marginRight: "30px" }} /> CoCalc -
          Subscriptions
        </h1>
      </div>
      <div style={{ fontSize: "12pt" }}>
        <a id="subscriptions"></a>
        <p>
          Initially, you start using CoCalc under a{" "}
          <A href="https://doc.cocalc.com/trial.html">free trial plan</A> in
          order to test out the service. If CoCalc works for you, please
          purchase a license.
        </p>
        <p>
          A subscription provides you with a{" "}
          <A href="https://doc.cocalc.com/licenses.html">license key</A> for{" "}
          <A href="https://doc.cocalc.com/project-settings.html#licenses">
            upgrading your projects
          </A>{" "}
          or other projects where you are a collaborator — everyone using an
          upgraded project benefits equally. Such a{" "}
          <A href="/billing/subscriptions">subscription</A>{" "}
          <b>automatically renews</b> at the end of each period. You can{" "}
          <A href="/billing/subscriptions">
            <b>cancel at any time</b>
          </A>
          .
        </p>

        {applyLicense()}

        <h2>Examples</h2>
        <p>
          We list three typical configurations below, which you can{" "}
          <A href="/store/site-license">modify and purchase here</A>. All
          parameters can be adjusted to fit your needs. Listed upgrades are for
          each project. Exact prices may vary. Below ${MIN_QUOTE}, only online
          purchases are available (no purchase orders). Subscriptions receive a{" "}
          {discount_monthly_pct}% discount for monthly and {discount_yearly_pct}
          % for yearly periods.
        </p>
        <List
          grid={{ gutter: 16, column: 3, xs: 1, sm: 1 }}
          dataSource={data}
          renderItem={(item) => (
            <PricingItem title={item.title} icon={item.icon}>
              <Line amount={item.projects} desc="Projects" />
              <Line amount={item.shared_ram} desc="Shared RAM per project" />
              <Line amount={item.shared_cores} desc="Shared CPU per project" />
              <Line amount={item.disk} desc="Disk space per project" />
              <Line amount={item.uptime} desc="Idle timeout" />
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
                    color: COLORS.GRAY_DD,
                  }}
                >
                  {money(item.monthly, true)}
                </span>{" "}
                / month
              </div>
              <div>
                <span
                  style={{
                    fontWeight: "bold",
                    fontSize: "18pt",
                    color: COLORS.GRAY_DD,
                  }}
                >
                  {money(item.yearly, true)}
                </span>{" "}
                / year
              </div>
              <LinkToStore conf={item.conf} />
            </PricingItem>
          )}
        />
        {listedPrices()}
        {pricingQuestions()}
      </div>
      {dedicated()}
    </div>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Layout, List } from "antd";

import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { LicenseIdleTimeouts, Uptime } from "@cocalc/util/consts/site-license";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import {
  discount_pct,
  discount_yearly_pct,
} from "@cocalc/util/licenses/purchase/consts";
import { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import { money } from "@cocalc/util/licenses/purchase/utils";
import { COLORS } from "@cocalc/util/theme";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import PricingItem, { Line } from "components/landing/pricing-item";
import { Paragraph, Text, Title } from "components/misc";
import A from "components/misc/A";
import { listedPrices } from "components/share/pricing";
import { LinkToStore, StoreConf } from "components/store/link";
import { MAX_WIDTH } from "lib/config";
import { Customize, useCustomize } from "lib/customize";
import withCustomize from "lib/with-customize";
import { round2 } from "@cocalc/util/misc";

interface Item {
  title: string;
  icon: IconName;
  individuals?: number;
  ratio?: number;
  students?: number;
  disk: number;
  shared_ram: number;
  shared_cores: number;
  academic: boolean;
  retail?: number;
  online: number;
  uptime?: string;
  conf: StoreConf;
}

const duration = "1 year";

// internal link to the contact form
const URL_SUPPORT =
  "/support/new?type=purchase&subject=CoCalc%20Institutional&body=&title=Purchase%20Institutional%20License";

const workgroup: Item = (() => {
  const individuals = 10;
  const ratio = 3;
  const projects = ratio * individuals;

  const conf = {
    run_limit: projects,
    user: "business",
    period: "yearly",
    ram: 5,
    disk: 10,
    cpu: 1,
    uptime: "medium" as Uptime,
    start: new Date(),
  } as const;

  const profPrice = compute_cost({
    type: "quota",
    user: conf.user,
    upgrade: "custom",
    quantity: conf.run_limit,
    subscription: "yearly",
    start: conf.start,
    custom_ram: conf.ram,
    custom_cpu: conf.cpu,
    custom_disk: conf.disk,
    custom_member: true,
    custom_dedicated_ram: 0,
    custom_dedicated_cpu: 0,
    custom_uptime: conf.uptime,
  } as PurchaseInfo);

  return {
    title: `Commercial Research Group`,
    icon: "atom",
    individuals,
    duration,
    ratio,
    disk: conf.disk,
    uptime: LicenseIdleTimeouts[conf.uptime].labelShort,
    shared_ram: conf.ram,
    dedicated_ram: 0,
    shared_cores: conf.cpu,
    dedicated_cores: 0,
    academic: false,
    retail: profPrice.cost,
    online: profPrice.discounted_cost,
    conf,
  };
})();

const uniMedium: Item = (() => {
  const students = 200;
  const conf = {
    run_limit: students,
    period: "yearly",
    ram: 2,
    disk: 3,
    cpu: 1,
    uptime: "medium" as Uptime,
    user: "academic",
    start: new Date(),
  } as const;

  const price = compute_cost({
    type: "quota",
    user: conf.user,
    upgrade: "custom",
    quantity: conf.run_limit,
    subscription: "yearly",
    start: conf.start,
    custom_ram: conf.ram,
    custom_cpu: conf.cpu,
    custom_disk: conf.disk,
    custom_member: true,
    custom_dedicated_ram: 0,
    custom_dedicated_cpu: 0,
    custom_uptime: conf.uptime,
  } as PurchaseInfo);

  return {
    title: `Up to ${students} students at once`,
    icon: "graduation-cap",
    students,
    disk: conf.disk,
    uptime: LicenseIdleTimeouts[conf.uptime].labelShort,
    shared_ram: conf.ram,
    shared_cores: conf.cpu,
    academic: true,
    retail: price.cost,
    online: price.discounted_cost,
    conf,
  };
})();

const uniLarge: Item = (() => {
  const students = 2000;
  const conf = {
    run_limit: students,
    period: "yearly",
    user: "academic",
    ram: 1,
    disk: 3,
    cpu: 1,
    uptime: "short",
    start: new Date(),
  } as const;

  const price = compute_cost({
    type: "quota",
    user: conf.user,
    upgrade: "custom",
    quantity: conf.run_limit,
    subscription: "yearly",
    start: conf.start,
    custom_ram: conf.ram,
    custom_cpu: conf.cpu,
    custom_disk: conf.disk,
    custom_member: true,
    custom_dedicated_ram: 0,
    custom_dedicated_cpu: 0,
    custom_uptime: conf.uptime,
  } as PurchaseInfo);

  return {
    title: `Up to ${students} students at once`,
    icon: "graduation-cap",
    students,
    disk: conf.disk,
    uptime: LicenseIdleTimeouts[conf.uptime].labelShort,
    shared_ram: conf.ram,
    shared_cores: conf.cpu,
    academic: true,
    retail: price.cost,
    online: price.discounted_cost,
    conf,
  };
})();

const data: Item[] = [workgroup, uniMedium, uniLarge];

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
        This page gives you an overview about{" "}
        <Text strong>recurring yearly license subscriptions</Text> for an
        organization or institution. The price of a {siteName} license is
        proportional to the number of projects and the amount of resources
        allocated for each project. The options presented on this page are
        possible examples – they are customizable in the{" "}
        <A href="/store/site-license?user=academic&period=yearly">
          online store
        </A>
        .
      </Paragraph>
      <Paragraph>
        Regarding the amount of upgrades: minimal upgrades might be okay for
        day-to-day calculations and editing documents, but you might run into
        limitations if your requirements are higher. Please{" "}
        <A href={URL_SUPPORT}>contact us</A> if you have questions or need a
        trial license to test out different options.
      </Paragraph>
      <Paragraph>
        Once you purchase a license key, you become a "license manager". This
        means you can pass that license key on to others, track their usage, and
        add other people as license managers.
      </Paragraph>
      <Paragraph>
        You can also acquire several licenses keys for your institution. This
        means you can partition all possible users into smaller gropus, each
        with their own license key. This is useful if you want to have distinct
        license keys for different departments, or if you want to have a license
        key for students and another one for faculty members.
      </Paragraph>

      <Title level={2}>Examples</Title>
      <Paragraph>
        Here are three typical configurations. All parameters can be adjusted to
        fit your needs. Listed upgrades are for each project. Exact prices may
        vary. Processing purchase orders with subsequent invoices need a minimum
        of $100.
        <Alert
          showIcon
          style={{ maxWidth: "500px", margin: "30px auto" }}
          type="warning"
          message={
            <div>
              The listed number of students below (e.g., 200) does <b>not</b> refer to the
              total number of students in your department. It is the number of
              students that will be using {siteName} all at the same time. You
              could have thousands of students in your department who all use{" "}
              {siteName} in a year, and buy what is listed as "200 students"
              below, as long as at most 200 are simultaneously using {siteName}.
            </div>
          }
        />
      </Paragraph>

      <List
        grid={{ gutter: 15, column: 3, xs: 1, sm: 1 }}
        dataSource={data}
        renderItem={(item) => {
          return (
            <PricingItem title={item.title} icon={item.icon}>
              {item.individuals && (
                <Line amount={item.individuals} desc="Individuals" />
              )}
              {item.students && (
                <Line
                  amount={item.students}
                  desc={`Students using ${siteName} all at the same time`}
                />
              )}
              {item.ratio && (
                <Line amount={item.ratio} desc="Projects per individual" />
              )}
              <Line amount={duration} desc="Duration" />
              <Line amount={item.uptime} desc="Idle timeout" />
              <Line amount={item.shared_ram} desc="Shared RAM" />
              <Line amount={item.shared_cores} desc="Shared CPU" />
              <Line amount={item.disk} desc="Disk space" />
              <Line amount={`${discount_yearly_pct}%`} desc="Yearly discount" />
              {item.academic && (
                <Line amount={`${discount_pct}%`} desc="Academic discount" />
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
                  {money(item.online, true)}
                  <span style={{ color: COLORS.GRAY_L }}>/year</span>
                </span>{" "}
              </div>
              {item.retail ? (
                <div style={{ color: COLORS.GRAY }}>
                  (
                  <span
                    style={{
                      fontWeight: "bold",
                      fontSize: "14pt",
                    }}
                  >
                    {money(item.retail, true)}
                  </span>{" "}
                  via purchase order)
                </div>
              ) : (
                <div>
                  <span style={{ fontSize: "14pt" }}>&nbsp;</span>
                </div>
              )}
              <LinkToStore conf={item.conf} />
              <div style={{ textAlign: "center", marginTop: "10px" }}>
                (${round2(item.online / item.conf.run_limit)} / project / year)
              </div>
            </PricingItem>
          );
        }}
      />

      {listedPrices()}

      <Title level={2}>Contact us</Title>
      <Paragraph>
        To learn more about institutional subscription options, please{" "}
        <A href={URL_SUPPORT}>
          contact us with a description of your specific requirements
        </A>
        .
      </Paragraph>
    </div>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

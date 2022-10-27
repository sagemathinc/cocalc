/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { LicenseIdleTimeouts, Uptime } from "@cocalc/util/consts/site-license";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import { discount_pct } from "@cocalc/util/licenses/purchase/consts";
import { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import { money } from "@cocalc/util/licenses/purchase/utils";
import { COLORS } from "@cocalc/util/theme";
import { Layout, List } from "antd";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import PricingItem, { Line } from "components/landing/pricing-item";
import A from "components/misc/A";
import { LinkToStore, StoreConf } from "components/store/link";
import { encodeRange } from "components/store/quota-query-params";
import { MAX_WIDTH } from "lib/config";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import { listedPrices } from "./_shared";

interface Item {
  title: string;
  icon: IconName;
  teachers: number;
  students: number;
  duration: string;
  disk: number;
  shared_ram: number;
  shared_cores: number;
  academic: boolean;
  retail?: number;
  online: number;
  uptime?: string;
  conf: StoreConf;
}

const training: Item = (() => {
  const students = 10;
  const days = 5;
  const conf = {
    run_limit: students + 1,
    user: "business",
    days,
    ram: 5,
    disk: 5,
    cpu: 1,
    uptime: "medium" as Uptime,
    start: new Date(),
    end: new Date(new Date().getTime() + days * 24 * 60 * 60 * 1000),
  } as const;

  const profPrice = compute_cost({
    type: "quota",
    user: conf.user,
    upgrade: "custom",
    quantity: conf.run_limit,
    subscription: "no",
    start: conf.start,
    end: conf.end,
    custom_ram: conf.ram,
    custom_cpu: conf.cpu,
    custom_disk: conf.disk,
    custom_member: true,
    custom_dedicated_ram: 0,
    custom_dedicated_cpu: 0,
    custom_uptime: conf.uptime,
  } as PurchaseInfo);

  return {
    title: `${conf.days} Day Professional Training`,
    icon: "battery-quarter",
    teachers: 1,
    students,
    duration: `${conf.days} days`,
    disk: conf.disk,
    uptime: LicenseIdleTimeouts[conf.uptime].labelShort,
    shared_ram: conf.ram,
    dedicated_ram: 0,
    shared_cores: conf.cpu,
    dedicated_cores: 0,
    academic: false,
    online: profPrice.discounted_cost,
    conf,
  };
})();

const courseSmall: Item = (() => {
  const students = 10;
  const days = 30;
  const conf = {
    run_limit: students + 1,
    days,
    ram: 2,
    disk: 3,
    cpu: 1,
    uptime: "short",
    user: "academic",
    start: new Date(),
    end: new Date(new Date().getTime() + days * 24 * 60 * 60 * 1000),
  } as const;

  const price = compute_cost({
    type: "quota",
    user: conf.user,
    upgrade: "custom",
    quantity: conf.run_limit,
    subscription: "no",
    start: conf.start,
    end: conf.end,
    custom_ram: conf.ram,
    custom_cpu: conf.cpu,
    custom_disk: conf.disk,
    custom_member: true,
    custom_dedicated_ram: 0,
    custom_dedicated_cpu: 0,
    custom_uptime: conf.uptime,
  } as PurchaseInfo);

  return {
    title: `${students} students for ${conf.days} days`,
    icon: "battery-half",
    teachers: 1,
    students,
    duration: `${conf.days} days`,
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

const courseLarge: Item = (() => {
  const students = 150;
  const months = 4;
  const days = months * 30;
  const conf = {
    run_limit: students + 1,
    days,
    user: "academic",
    ram: 2,
    disk: 3,
    cpu: 1,
    uptime: "short",
    start: new Date(),
    end: new Date(new Date().getTime() + days * 24 * 60 * 60 * 1000),
  } as const;

  const price = compute_cost({
    type: "quota",
    user: conf.user,
    upgrade: "custom",
    quantity: conf.run_limit,
    subscription: "no",
    start: conf.start,
    end: conf.end,
    custom_ram: conf.ram,
    custom_cpu: conf.cpu,
    custom_disk: conf.disk,
    custom_member: true,
    custom_dedicated_ram: 0,
    custom_dedicated_cpu: 0,
    custom_uptime: conf.uptime,
  } as PurchaseInfo);

  return {
    title: `${students} Students for ${months} Months`,
    icon: "battery-full",
    teachers: 1,
    students,
    duration: `${days} days`,
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

const data: Item[] = [training, courseSmall, courseLarge];

export default function Courses({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Course licenses" />
      <Header page="pricing" subPage="courses" />
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
          <Icon name="graduation-cap" style={{ marginRight: "30px" }} />
          CoCalc - Course licenses
        </h1>
      </div>
      <div style={{ fontSize: "12pt" }}>
        <p>
          You{" "}
          <A href="https://doc.cocalc.com/teaching-instructors.html">
            teach a course
          </A>{" "}
          on <span>CoCalc</span> by creating one project for each student,
          sending your students assignments and handouts, then guiding their
          progress using collaboration and chat. You can then collect, grade,
          comment on, and return their work.
        </p>
        <p>
          You will need to purchase an appropriate license for your course, or
          have the students pay the one-time $14 fee, since CoCalc is not funded
          by advertisers or other intrusive methods.
        </p>

        <h2>How to get started?</h2>
        <p>
          You can{" "}
          <A href="/store/site-license" external>
            purchase a license for your course
          </A>{" "}
          in the{" "}
          <A href="/store" external>
            store
          </A>
          .
        </p>
        <p>
          Minimal upgrades might be okay for beginner courses, but we find that
          many data and computational science courses run better with additional
          RAM and CPU. <A href="mailto:help@cocalc.com">Contact us</A> if you
          have questions or need a trial license to test out different
          possibilities.
        </p>
        <p>
          Once you obtain a license key,{" "}
          <A href="https://doc.cocalc.com/teaching-upgrade-course.html">
            apply it to all your student projects
          </A>
          .
        </p>
        <p>
          You can acquire several licenses, e.g., to partition a semester into
          smaller parts with different requirements, or to keep upgrades
          separate between certain groups of courses or instructors.
        </p>

        <h2>Payment options</h2>
        <ul style={{ paddingLeft: "20px" }}>
          <li>
            <b>
              <A href="https://doc.cocalc.com/teaching-upgrade-course.html#teacher-or-institution-pays-for-upgrades">
                You or your institution pays
              </A>
            </b>{" "}
            for one or more license upgrades. You distribute the license
            upgrades to all projects of the course via the course configuration
            tab of the course management interface.
          </li>
          <li>
            <b>
              <A href="https://doc.cocalc.com/teaching-upgrade-course.html#students-pay-for-upgrades">
                Students pay a one-time fee.
              </A>
            </b>{" "}
            In the configuration frame of the course management file, you opt to
            require all students to pay a one-time $14 fee to upgrade their own
            projects.
          </li>
        </ul>

        <h2>Examples</h2>
        <p>
          Here are three typical configurations, which you can{" "}
          <A href="/store/site-license" external>
            modify and purchase here
          </A>
          . All parameters can be adjusted to fit your needs. Listed upgrades
          are for each project. Exact prices may vary. Only self-service online
          purchases are available below $100.
        </p>

        <List
          grid={{ gutter: 16, column: 3, xs: 1, sm: 1 }}
          dataSource={data}
          renderItem={(item) => {
            const conf = {
              ...item.conf,
              period: "range",
              range: encodeRange([item.conf.start, item.conf.end]),
            };
            return (
              <PricingItem title={item.title} icon={item.icon}>
                <Line amount={item.teachers} desc="Teacher" />
                <Line amount={item.students} desc="Students" />
                <Line amount={item.duration} desc="Duration" />
                <Line amount={item.uptime} desc="Idle timeout" />
                <Line amount={item.shared_ram} desc="Shared RAM" />
                <Line amount={item.shared_cores} desc="Shared CPU" />
                <Line amount={item.disk} desc="Disk space" />
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
                <LinkToStore conf={conf} />
              </PricingItem>
            );
          }}
        />
        {listedPrices()}

        <h2>Contact us</h2>
        <p>
          To learn more about your teaching options, email us at{" "}
          <A href="mailto:help@cocalc.com">help@cocalc.com</A> with a
          description of your specific requirements.
        </p>
      </div>
    </div>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../app-framework";
const { HelpEmailLink, SiteName } = require("../customize");
import { A, Space } from "../r_misc";
import {
  STUDENT_COURSE_PRICE,
  TEACHER_PAYS,
  STUDENT_PAYS,
  INSTRUCTOR_GUIDE,
  DOC_LICENSE_URL,
} from "./data";
import {
  compute_cost,
  discount_pct,
  User,
  Upgrade,
  Subscription,
} from "../site-licenses/purchase/util";
import { LicenseExamples } from "./license-examples";

export const TITLE = "Course licenses";

const p1data = {
  user: "academic" as User,
  upgrade: "custom" as Upgrade,
  quantity: 20 + 2,
  subscription: "no" as Subscription,
  start: new Date("2020-01-01T12:00Z"),
  end: new Date("2020-02-01T11:59:59.999Z"),
  custom_ram: 2,
  custom_cpu: 1,
  custom_disk: 1,
  custom_member: true,
  custom_dedicated_ram: 0,
  custom_dedicated_cpu: 0,
  custom_always_running: false,
};
const Price1 = compute_cost(p1data);

const p2data = {
  user: "business" as User,
  upgrade: "custom" as Upgrade,
  quantity: 5 + 1,
  subscription: "no" as Subscription,
  start: new Date("2020-01-01T12:00Z"),
  end: new Date("2020-01-06T11:59:59.999Z"),
  custom_ram: 2,
  custom_cpu: 1,
  custom_disk: 5,
  custom_member: true,
  custom_dedicated_ram: 1,
  custom_dedicated_cpu: 0.5,
  custom_always_running: false,
};
const Price2 = compute_cost(p2data);

const p3data = {
  user: "academic" as User,
  upgrade: "custom" as Upgrade,
  quantity: 120 + 2,
  subscription: "no" as Subscription,
  start: new Date("2020-01-01T12:00Z"),
  end: new Date("2020-05-01T11:59:59.999Z"),
  custom_ram: 1,
  custom_cpu: 1,
  custom_disk: 1,
  custom_member: true,
  custom_dedicated_ram: 0,
  custom_dedicated_cpu: 0,
  custom_always_running: false,
};
const Price3 = compute_cost(p3data);

const EXAMPLES = [
  {
    title: "Professional Training",
    icon: "battery-quarter",
    user: p2data.user,
    lines: [
      { value: 1, unit: "Trainer", resource: "Project" },
      { value: p2data.quantity - 1, unit: "Participant", resource: "Projects" },
      { value: 5, unit: "days", resource: "Duration" },
      { value: p2data.custom_ram, unit: "GB", resource: "Shared RAM" },
      { value: p2data.custom_cpu, unit: "cores", resource: "Shared CPU" },
      {
        value: p2data.custom_dedicated_ram,
        unit: "GB",
        resource: "Dedicated RAM",
      },
      {
        value: p2data.custom_dedicated_cpu,
        unit: "cores",
        resource: "Dedicated CPU",
      },
      { value: p2data.custom_disk, unit: "GB", resource: "Disk space" },
    ],
    price: Price2,
    period: `5 days`,
  },
  {
    title: `${p1data.quantity - 2} Students`,
    icon: "battery-three-quarters",
    user: p1data.user,
    lines: [
      { value: 1, unit: "Instructor", resource: "Project" },
      { value: 1, unit: "Shared", resource: "Project" },
      { value: p1data.quantity - 2, unit: "Student", resource: "Projects" },
      { value: 1, unit: "month", resource: "Duration" },
      { value: p1data.custom_ram, unit: "GB", resource: "Shared RAM" },
      { value: p1data.custom_cpu, unit: "cores", resource: "Shared CPU" },
      { value: p1data.custom_disk, unit: "GB", resource: "Disk space" },
      {
        value: discount_pct,
        unit: "%",
        resource: "Academic Discount",
      },
    ],
    price: Price1,
    period: "1 month",
  },
  {
    title: `${p3data.quantity - 2} Students`,
    icon: "battery-full",
    user: p3data.user,
    lines: [
      { value: 1, unit: "Instructor", resource: "Project" },
      { value: 1, unit: "Shared", resource: "Project" },
      { value: p3data.quantity - 2, unit: "Student", resource: "Projects" },
      { value: 4, unit: "months", resource: "Duration" },
      { value: p3data.custom_ram, unit: "GB", resource: "Shared RAM" },
      { value: p3data.custom_cpu, unit: "cores", resource: "Shared CPU" },
      { value: p3data.custom_disk, unit: "GB", resource: "Disk space" },
      {
        value: discount_pct,
        unit: "%",
        resource: "Academic Discount",
      },
    ],
    price: Price3,
    period: "4 months",
  },
];

export const ExplainLicenses: React.FC<{}> = () => {
  function render_intro() {
    return (
      <>
        <p>
          Here is how you <A href={INSTRUCTOR_GUIDE}>teach a course</A> on{" "}
          <SiteName />. Each student works in their own project, while you
          oversee everyone and track everyone's progress. <SiteName />
          {"'s"} real-time collaboration makes it easy to help students directly
          where they work.
        </p>
      </>
    );
  }

  function render_licenses() {
    return (
      <>
        <h4>How to get started?</h4>
        <p>
          Go to your Account Settings &rarr; Licenses in order to start
          purchasing a license for your course:{" "}
          <A href={DOC_LICENSE_URL}>licenses documentation</A>.
        </p>
        <p>
          Minimal upgrades might be okay for beginner courses, but we find that
          many data and computational science courses run better with additional
          RAM and CPU. Contact us for a trial license: <HelpEmailLink />.
        </p>
        <p>
          Once you got your key, don't forget to register it in the{" "}
          <A href="https://doc.cocalc.com/teaching-notes.html#site-license-course-setup">
            course management interface
          </A>{" "}
          to be applied to all student projects.
        </p>
        <p>
          Please be also aware that you can acquire several licenses: e.g. to
          partition a semester into smaller parts or to keep upgrades separate
          between certain groups.
        </p>
      </>
    );
  }
  function render_payment_opts() {
    return (
      <>
        <h4>Payment options</h4>
        <ul style={{ paddingLeft: "20px" }}>
          <li>
            <b>
              <A href={TEACHER_PAYS}>You or your institution pays</A>
            </b>{" "}
            for one or more license upgrades. You distribute the license
            upgrades to all projects of the course via the course configuration
            frame of the course manager.
          </li>

          <li>
            <b>
              <A href={STUDENT_PAYS}>Students pay a one-time fee.</A>
            </b>{" "}
            In the configuration frame of the course management file, you opt to
            require all students to pay a one-time ${STUDENT_COURSE_PRICE} fee
            to upgrade their projects.
          </li>
        </ul>
      </>
    );
  }

  function render_examples() {
    return <LicenseExamples examples={EXAMPLES} show_discount_pct={false} />;
  }

  function render_contact() {
    return (
      <>
        <h4>Contact us</h4>
        <p>
          To learn more about these options, email us at <HelpEmailLink /> with
          a description of your specific requirements.
        </p>
        <Space />
      </>
    );
  }
  return (
    <div style={{ marginBottom: "10px" }}>
      <a id="courses" />
      <h3>{TITLE}</h3>
      <div>
        {render_intro()}
        <Space />
        {render_licenses()}
        <Space />
        {render_payment_opts()}
        <Space />
        {render_examples()}
        <Space />
        {render_contact()}
      </div>
    </div>
  );
};

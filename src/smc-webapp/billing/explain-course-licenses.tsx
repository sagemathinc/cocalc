/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../app-framework";
const { HelpEmailLink, SiteName } = require("../customize");
const { Panel } = require("react-bootstrap");
import { Col } from "react-bootstrap";
import { A, Space, Icon } from "../r_misc";
import {
  STUDENT_COURSE_PRICE,
  TEACHER_PAYS,
  STUDENT_PAYS,
  INSTRUCTOR_GUIDE,
  DOC_LICENSE_URL,
} from "./data";
import { COLORS } from "smc-util/theme";
import { compute_cost, percent_discount } from "../site-licenses/purchase/util";

export const TITLE = "Course licenses";

interface Example {
  title: string;
  icon: string;
  lines: { value: number; unit: string; resource: string }[];
  price: number;
  period: string;
}

const Price1 = compute_cost({
  user: "academic",
  upgrade: "custom",
  quantity: 20,
  subscription: "no",
  start: new Date("2020-01-01"),
  end: new Date("2020-02-01"),
  custom_ram: 1,
  custom_cpu: 1,
  custom_disk: 1,
  custom_member: true,
  custom_dedicated_ram: 0,
  custom_dedicated_cpu: 0,
  custom_always_running: false,
});

const EXAMPLES: Example[] = [
  {
    title: "Example 1",
    icon: "battery-quarter",
    lines: [
      { value: 1, unit: "mb", resource: "XY" },
      { value: 1, unit: "mb", resource: "XY" },
      {
        value: percent_discount(Price1.cost, Price1.discounted_cost),
        unit: "%",
        resource: "Academic Discount",
      },
    ],
    price: Price1.discounted_cost,
    period: "1 month",
  },
  {
    title: "Example 2",
    icon: "battery-three-quarters",
    lines: [
      { value: 1, unit: "mb", resource: "XY" },
      { value: 1, unit: "mb", resource: "XY" },
    ],
    price: 11,
    period: "3 days",
  },
  {
    title: "Example 3",
    icon: "battery-full",
    lines: [
      { value: 1, unit: "mb", resource: "XY" },
      { value: 1, unit: "mb", resource: "XY" },
    ],
    price: 14,
    period: "4 month",
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
        <h4>Which license upgrades?</h4>
        <p>
          Go to your Account Settings &rarr; Licenses in order to start
          purchasing a license for your course:{" "}
          <A href={DOC_LICENSE_URL}>licenses documentation</A>. The following
          parameters determine the pricing:
        </p>
        <ul style={{ paddingLeft: "20px" }}>
          <li>The number of projects</li>
          <li>If you qualify for an academic discount</li>
          <li>
            The upgrade schema per project: a small 1 GB memory / 1 shared CPU
            upgrade is fine for basic calculations, but we find that many data
            and computational science courses run better with the additional RAM
            and CPU.
          </li>
          <li>Duration</li>
          <li>Invoicing/Billing</li>
        </ul>
        <p>
          Please be also aware that you can aquire several licenses: e.g. to
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

  function render_example_line({ value, unit, resource }) {
    return (
      <div style={{ marginBottom: "5px", marginLeft: "10px" }}>
        <span style={{ fontWeight: "bold", color: "#444" }}>
          {value} {unit}
        </span>
        <Space />
        <span style={{ color: COLORS.GRAY }}>{resource}</span>
      </div>
    );
  }

  function render_example_price({ price, period }) {
    return (
      <span style={{ whiteSpace: "nowrap" }}>
        <span style={{ fontSize: "16px", verticalAlign: "super" }}>$</span>
        <Space />
        <span style={{ fontSize: "30px" }}>{price}</span>
        <span style={{ fontSize: "14px" }}> / {period}</span>
      </span>
    );
  }

  function render_example({ title, icon, lines, price, period }: Example) {
    const header = (
      <div style={{ paddingLeft: "10px" }}>
        <Icon name={icon} /> <span style={{ fontWeight: "bold" }}>{title}</span>
      </div>
    );
    return (
      <Col sm={4}>
        <Panel header={header} bsStyle={"info"}>
          <Space />
          {lines.map((line) => render_example_line(line))}
          <Space />

          <div style={{ textAlign: "center", marginTop: "10px" }}>
            {render_example_price({ price, period })}
          </div>
        </Panel>
      </Col>
    );
  }

  function render_examples() {
    return (
      <div style={{ marginBottom: "10px" }}>
        {EXAMPLES.map((ex) => render_example(ex))}
      </div>
    );
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
        {render_licenses()}
        {render_payment_opts()}
        {render_examples()}
        {render_contact()}
      </div>
    </div>
  );
};

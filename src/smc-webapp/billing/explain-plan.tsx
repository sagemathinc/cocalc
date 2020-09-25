/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../app-framework";
const { HelpEmailLink, SiteName } = require("../customize");
import { A } from "../r_misc";
import {
  STUDENT_COURSE_PRICE,
  TEACHER_PAYS,
  STUDENT_PAYS,
  INSTRUCTOR_GUIDE,
} from "./data";
import { Space } from "../r_misc/space";

interface Props {
  type: "personal" | "course";
}

export const ExplainPlan: React.FC<Props> = (props: Props) => {
  const { type } = props;

  function render_dedicated() {
    return (
      <div>
        <b>Note:</b> For highly intensive workloads you can also purchase{" "}
        <a href="#dedicated">Dedicated resources</a>.
      </div>
    );
  }
  function render_personal() {
    return (
      <div style={{ marginBottom: "10px" }}>
        <a id="subscriptions" />
        <h3>Service subscriptions</h3>
        <p>
          A subscription awards you with a{" "}
          <A href="https://doc.cocalc.com/account/licenses.html">license key</A>{" "}
          for{" "}
          <A href="https://doc.cocalc.com/project-settings.html#licenses">
            upgrading your projects
          </A>{" "}
          or other projects where you are a collaborator &mdash; everyone using
          an upgraded project benefits. Such a subscription{" "}
          <b>automatically renews</b> at the end of each period. You can{" "}
          <b>cancel at any time</b>.
        </p>
        <Space />
        <br />
        {render_dedicated()}
        <br />
      </div>
    );
  }

  function render_course() {
    return (
      <div style={{ marginBottom: "10px" }}>
        <a id="courses" />
        <h3>Course packages</h3>
        <div>
          <p>
            You can <A href={INSTRUCTOR_GUIDE}>teach a course</A> on{" "}
            <SiteName />. Each student works in their own project, while you
            oversee everyone and track everyone's progress. <SiteName />
            {"'s"} real-time collaboration makes it easy to help students
            directly where they work.
          </p>
          <h4>Payment options</h4>
          <ul style={{ paddingLeft: "20px" }}>
            <li>
              <b>
                <A href={TEACHER_PAYS}>You or your institution pays</A>
              </b>{" "}
              for one or more course plans. You distribute the quota upgrades to
              all projects of the course via the configuration frame of the
              course management file. Course packages start immediately after
              purchase, last for the indicated period, and do{" "}
              <b>not auto-renew</b> when they end.
            </li>

            <li>
              <b>
                <A href={STUDENT_PAYS}>Students pay a one-time fee.</A>
              </b>{" "}
              In the configuration frame of the course management file, you opt
              to require all students to pay a one-time ${STUDENT_COURSE_PRICE}{" "}
              fee to upgrade their projects.
            </li>
          </ul>
          <h4>Basic, Standard or Premium?</h4>
          <p>
            Our basic plan works well for cases where you are only doing small
            computations in a single notebook/worksheet or just need internet
            access and better hosting uptime.
          </p>
          <p>
            However, we find that many data and computational science courses
            run better with the additional RAM and CPU found in the standard or
            premium plans.
          </p>
          <h4>Custom Course Plans</h4>
          <p>
            In addition to the plans listed on this page, we offer the following
            on a custom basis:
          </p>
          <ul style={{ paddingLeft: "20px" }}>
            <li>start on a specified date after payment</li>
            <li>customized duration</li>
            <li>customized number of students</li>
            <li>bundle several courses with different start dates</li>
            <li>
              transfer upgrades from purchasing account to course administrator
              account
            </li>
          </ul>
          <p>
            To learn more about these options, email us at <HelpEmailLink />{" "}
            with a description of your specific requirements.
          </p>
          <Space />
        </div>
      </div>
    );
  }

  switch (type) {
    case "personal":
      return render_personal();
    case "course":
      return render_course();
    default:
      throw Error(`unknown plan type ${type}`);
  }
};

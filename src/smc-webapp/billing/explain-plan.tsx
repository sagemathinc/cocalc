import { React, Component, Rendered } from "../app-framework";
const { HelpEmailLink, SiteName } = require("../customize");
import { A } from "../r_misc";
import { STUDENT_COURSE_PRICE } from "./data";
import { Space } from "../r_misc/space";

interface Props {
  type: "personal" | "course";
}

const TEACHER_PAYS =
  "https://doc.cocalc.com/teaching-create-course.html#option-2-teacher-or-institution-pays-for-upgrades";
const STUDENT_PAYS =
  "https://doc.cocalc.com/teaching-create-course.html#option-1-students-pay-for-upgrades";
const INSTRUCTOR_GUIDE = "https://doc.cocalc.com/teaching-instructors.html";

export class ExplainPlan extends Component<Props> {
  private render_dedicated(): Rendered {
    return (
      <div>
        For highly intensive workloads you can also purchase{" "}
        <a href="#dedicated">Dedicated resources</a>.
      </div>
    );
  }
  private render_personal(): Rendered {
    return (
      <div style={{ marginBottom: "10px" }}>
        <a id="subscriptions" />
        <h3>Personal subscriptions</h3>
        <p>
          Personal subscriptions award you with{" "}
          <A href="https://doc.cocalc.com/billing.html#quota-upgrades">
            upgrades for project quotas
          </A>
          . They <b>automatically renew</b> after each period and you can{" "}
          <b>cancel at any time</b>.
        </p>
        <p>
          Once such upgrades are added to your account, you can distribute them
          to your own projects or other projects where you are a collaborator
          &mdash; everyone using an upgraded project benefits.
        </p>
        <p>
          Quota upgrades can be added or removed at any time – move them between
          your projects as often as you like.
        </p>
        <Space />

        <br />
        {this.render_dedicated()}
        <br />
      </div>
    );
  }

  private render_course(): Rendered {
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

  public render(): Rendered {
    switch (this.props.type) {
      case "personal":
        return this.render_personal();
      case "course":
        return this.render_course();
      default:
        throw Error(`unknown plan type ${this.props.type}`);
    }
  }
}

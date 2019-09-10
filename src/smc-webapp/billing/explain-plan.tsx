import { React, Component, Rendered } from "../app-framework";
const { HelpEmailLink, SiteName } = require("../customize");

import { STUDENT_COURSE_PRICE } from "./data";

interface Props {
  type: "personal" | "course";
}

export class ExplainPlan extends Component<Props> {
  private render_dedicated(): Rendered {
    return (
      <div>
        For highly intensive workloads you can also purchase {" "}
        <a href="#dedicated">Dedicated resources</a>.
      </div>
    );
  }
  private render_personal(): Rendered {
    return (
      <div style={{ marginBottom: "10px" }}>
        <a id="subscriptions" />
        <h3>Personal subscriptions</h3>
        <div>
          We offer several subscriptions that let you upgrade the default free
          quotas on projects. You can distribute these upgrades to your own
          projects or any projects where you are a collaborator &mdash; everyone
          participating in such a collective project benefits and can easily
          change their allocations at any time! You can get higher-quality
          hosting on members-only machines and enable access to the internet
          from projects. You can also increase quotas for CPU and RAM, so that
          you can work on larger problems and do more computations
          simultaneously.
        </div>
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
            We offer course packages to support teaching using <SiteName />.
            They start right after purchase and last for the indicated period
            and do <b>not auto-renew</b>. Follow the{" "}
            <a
              href="https://doc.cocalc.com/teaching-instructors.html"
              target="_blank"
              rel="noopener"
            >
              instructor guide
            </a>{" "}
            to create a course file for your new course. Each time you add a
            student to your course, a project will be automatically created for
            that student. You can create and distribute assignments, students
            work on assignments inside their project (where you can see their
            progress in realtime and answer their questions), and you later
            collect and grade their assignments, then return them.
          </p>
          <p>
            Payment is required. This will ensure that your students have a
            better experience, network access, and receive priority support. The
            cost is <b>between $4 and ${STUDENT_COURSE_PRICE} per student</b>,
            depending on class size and whether you or your students pay.{" "}
            <b>Start right now:</b>{" "}
            <i>
              you can fully set up your class and add students immediately
              before you pay us anything!
            </i>
          </p>
          <h4>You or your institution pays</h4>
          You or your institution may pay for one of the course plans. You then
          use your plan to upgrade all projects in the course in the settings
          tab of the course file.
          <h4>Students pay</h4>
          In the settings tab of your course, you require that all students pay
          a one-time ${STUDENT_COURSE_PRICE} fee to move their projects to
          members only hosts and enable full internet access.
          <br />
          <h4>Basic or Standard?</h4>
          Our basic plans work well for cases where you are only doing small
          computations or just need internet access and better hosting uptime.
          However, we find that many data science and computational science
          courses run much smoother with the additional RAM and CPU found in the
          standard plan.
          <h4>Custom Course Plans</h4>
          In addition to the plans listed on this page, we can offer the
          following on a custom basis:
          <ul>
            <li>start on a specified date after payment</li>
            <li>customized duration</li>
            <li>customized number of students</li>
            <li>bundle several courses with different start dates</li>
            <li>
              transfer upgrades from purchasing account to course administrator
              account
            </li>
          </ul>
          To learn more about these options, email us at <HelpEmailLink /> with
          a description of your specific requirements.
          <br />
          <br />
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

import { React, Component, Rendered } from "../app-framework";
const { HelpEmailLink, SiteName } = require("../customize");
import { A } from "../r_misc/A";
import { STUDENT_COURSE_PRICE } from "./data";
import { Space } from "../r_misc/space";

interface Props {
  type: "personal" | "course";
}

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
            quota upgrades
          </A>
          . They automatically renew after each period and you can cancel at any
          time.
        </p>
        <p>
          Distribute these upgrades to your own projects or other projects where
          you are a collaborator &mdash; everyone participating in such a
          collective project benefits.
        </p>
        <p>
          Quota upgrades can be added or removed at any time: move them between
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
            {" "}
            We offer upgrade packages for teaching a course using <SiteName />.
            They start right after purchase and last for the indicated period
            and do <b>not auto-renew</b>.{" "}
          </p>
          <p>
            <A href="https://doc.cocalc.com/teaching-instructors.html">
              instructor guide
            </A>{" "}
            to create a course file for your new course. Each time you add a
            student to your course, a project will be automatically created for
            that student. You can create and distribute assignments, students
            work on assignments inside their project (where you can see their
            progress in realtime and answer their questions), and you later
            collect and grade their assignments, then return them.
          </p>
          <p>
            <b>Payment is required:</b> a{" "}
            <b>
              one-time fee between $4 and ${STUDENT_COURSE_PRICE} per student
            </b>
            , depending on class size, duraiton, and whether you or your
            students pay. This will ensure that your students have a better
            experience, network access, and receive priority support.
          </p>
          <p>
            <b>Start right now:</b>{" "}
            <i>
              you can fully set up your class and add students immediately,{" "}
              before you pay anything!
            </i>{" "}
            Right after the course package purchase, the upgrades are added to
            your account and last for the indicated period &mdash; course
            packages <b>do not auto-renew</b>.
          </p>
          <h4>Payment options</h4>
          <ul style={{ paddingLeft: "20px" }}>
            <li>
              <b>
                <A
                  href={
                    "https://doc.cocalc.com/teaching-create-course.html#option-2-teacher-or-institution-pays-for-upgrades"
                  }
                >
                  You or your institution pays
                </A>
              </b>{" "}
              for one or more course plans. You then distribute the quota
              upgrades to all projects in the course in the settings tab of the
              course file.
            </li>

            <li>
              <b>
                <A href="https://doc.cocalc.com/teaching-create-course.html#option-1-students-pay-for-upgrades">
                  Students pay a one-time fee.
                </A>
              </b>{" "}
              In the settings tab of your course, you require that all students
              pay a one-time ${STUDENT_COURSE_PRICE} fee to move their projects
              to members only hosts and enable full internet access.
            </li>
          </ul>
          <h4>Basic, Standard or Premium?</h4>
          <p>
            {" "}
            Our basic plan works well for cases where you are only doing small
            computations in a single notebook/worksheet or just need internet
            access and better hosting uptime.
          </p>
          <p>
            However, we find that many data science and computational science
            courses run much smoother with the additional RAM and CPU found in
            the standard or premium plans.
          </p>
          <h4>Custom Course Plans</h4>
          In addition to the plans listed on this page, we can offer the
          following on a custom basis:
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
          To learn more about these options, email us at <HelpEmailLink /> with
          a description of your specific requirements.
          <Space />
          <h4>More information</h4>
          <p>
            The{" "}
            <b>
              <A href="https://doc.cocalc.com/teaching-instructors.html">
                instructor guide
              </A>
            </b>{" "}
            explains how to create a course, add students, apply upgrades,
            create/distribute assignments, and later collect and grade them.
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

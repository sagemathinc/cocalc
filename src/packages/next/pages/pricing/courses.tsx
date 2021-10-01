import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { List, Layout } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import A from "components/misc/A";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import PricingItem, { Line } from "components/landing/pricing-item";

interface Item {
  title: string;
  icon: IconName;
  teachers: number;
  students: number;
  duration: string;
  disk: number;
  shared_ram: number;
  dedicated_ram?: number;
  shared_cores: number;
  dedicated_cores?: number;
  academic: boolean;
  retail?: number;
  online?: number;
}

const data: Item[] = [
  {
    title: "5 Day Professional Training",
    icon: "battery-quarter",
    teachers: 1,
    students: 5,
    duration: "5 days",
    disk: 5,
    shared_ram: 2,
    dedicated_ram: 1,
    shared_cores: 1,
    dedicated_cores: 0.5,
    academic: false,
    online: 33.83,
  },
  {
    title: "20 Students for 1 Month",
    icon: "battery-half",
    teachers: 1,
    students: 20,
    duration: "1 month",
    disk: 1,
    shared_ram: 2,
    shared_cores: 1,
    academic: true,
    retail: 113.03,
    online: 84.77,
  },
  {
    title: "120 Students for 4 Months",
    icon: "battery-full",
    teachers: 1,
    students: 120,
    duration: "4 months",
    disk: 1,
    shared_ram: 1,
    shared_cores: 1,
    academic: true,
    retail: 2203.41,
    online: 1652.56,
  },
];

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
              progress using collaboration and chat. You can then collect,
              grade, comment on, and return their work.
            </p>
            <p>
              You will need to purchase an appropriate license for your course,
              or have the students pay the one-time $14 fee, since CoCalc is not
              funded by advertisers or other intrusive methods.
            </p>

            <h2>How to get started?</h2>
            <p>
              Sign in to <span>CoCalc</span>, go to{" "}
              <strong>
                <A href="https://doc.cocalc.com/account/licenses.html">
                  {" "}
                  Account Settings
                </A>
              </strong>{" "}
              and open the <strong>"Licenses" tab</strong>. Click on the{" "}
              <strong>"Buy a license..."</strong> button to reveal a{" "}
              <A href="https://doc.cocalc.com/licenses.html">
                form to configure your license
              </A>
              .
            </p>
            <p>
              Minimal upgrades might be okay for beginner courses, but we find
              that many data and computational science courses run better with
              additional RAM and CPU.{" "}
              <A href="mailto:help@cocalc.com">Contact us</A> if you have
              questions or need a trial license to test out different
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
              You can acquire several licenses, e.g., to partition a semester
              into smaller parts with different requirements, or to keep
              upgrades separate between certain groups of courses or
              instructors.
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
                upgrades to all projects of the course via the course
                configuration tab of the course management interface.
              </li>
              <li>
                <b>
                  <A href="https://doc.cocalc.com/teaching-upgrade-course.html#students-pay-for-upgrades">
                    Students pay a one-time fee.
                  </A>
                </b>{" "}
                In the configuration frame of the course management file, you
                opt to require all students to pay a one-time $14 fee to upgrade
                their own projects.
              </li>
            </ul>

            <h2>Examples</h2>
            <p>
              Here are three typical configurations. All parameters can be
              adjusted to fit your needs. Listed upgrades are for each project.
              Exact prices may vary. Only self-service online purchases are
              available below $100.
            </p>

            <List
              grid={{ gutter: 16, column: 3, xs: 1, sm: 1 }}
              dataSource={data}
              renderItem={(item) => (
                <PricingItem title={item.title} icon={item.icon}>
                  <Line amount={item.teachers} desc="Teacher" />
                  <Line amount={item.students} desc="Students" />
                  <Line amount={item.duration} desc="Duration" />
                  <Line amount={item.shared_ram} desc="Shared RAM" />
                  <Line amount={item.shared_cores} desc="Shared CPU" />
                  <Line amount={item.disk} desc="Disk space" />
                  <Line amount={item.dedicated_ram} desc="Dedicated RAM" />
                  <Line amount={item.dedicated_cores} desc="Dedicated CPU" />
                  <br />
                  <br />
                  <div>
                    <span
                      style={{
                        fontWeight: "bold",
                        fontSize: "18pt",
                        color: "#555",
                      }}
                    >
                      ${item.online}
                    </span>{" "}
                  </div>
                  {item.retail ? (
                    <div style={{ color: "#888" }}>
                      (
                      <span
                        style={{
                          fontWeight: "bold",
                          fontSize: "14pt",
                        }}
                      >
                        ${item.retail}
                      </span>{" "}
                      via purchase order)
                    </div>
                  ) : (
                    <div>
                      <span style={{ fontSize: "14pt" }}>&nbsp;</span>
                    </div>
                  )}
                </PricingItem>
              )}
            />

            <h2>Contact us</h2>
            <p>
              To learn more about your teaching options, email us at{" "}
              <A href="mailto:help@cocalc.com">help@cocalc.com</A> with a
              description of your specific requirements.
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

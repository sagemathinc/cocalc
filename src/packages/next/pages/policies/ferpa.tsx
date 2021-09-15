import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Layout } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";

export default function FERPA({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="CoCalc - FERPA Policy" />
      <Header page="policies" subPage="ferpa" />
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
              CoCalc - FERPA Compliance Statement
            </h1>
            <h2>Last Updated: September 1, 2020</h2>
          </div>
          <div style={{ fontSize: "12pt" }}>
            <div>
              <p>
                Educational institutions must take steps to ensure that the
                companies that they work with will help comply with FERPA. FERPA
                requires that reasonable measures be taken to ensure the
                security of personally identifiable information (PII) from
                student academic records. PII may only be shared with a
                student's instructor or other school officials (the school is
                responsible for responding to parent requests for information).
                Schools and educators are allowed to divulge 'directory
                information', such as name and email address, unless a student
                has asked to opt-out of directory information disclosure, which
                means that in most cases instructors may submit student email
                addresses when adding students to a course.
              </p>
              <p>
                SageMath, Inc. will make every effort to comply with FERPA
                disclosures policies. If you represent an academic institution
                and require access to a student's PII under FERPA, please
                contact{" "}
                <a href="mailto:office@sagemath.com">office@sagemath.com</a>.
              </p>
            </div>
          </div>
        </div>
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}

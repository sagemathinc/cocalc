import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Layout } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import { MAX_WIDTH } from "lib/config";

export default function AccessibilityPage({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Accessibility" />
      <Layout>
        <Header page="policies" subPage="accessibility" />
        <Layout.Content
          style={{
            backgroundColor: "white",
          }}
        >
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
                CoCalc - Accessibility Statement
              </h1>
            </div>
            <div style={{ fontSize: "12pt", overflowX: "auto" }}>
              <p>
                Given the scope of what is possible in CoCalc, such as using
                arbitrary Jupyter notebooks with custom styling and a broad
                collection of software including user installed packages, it is
                infeasible to expect that everything will be fully accessible
                and aligned with any standards, such as WCAG. However, we are
                committed to do our best to resolve any concrete issues that our
                customers face. We have a long history of successfully
                facilitating courses for thousands of students (i.e. for users
                who cannot easily switch to an alternative platform) as evidence
                of success of this approach.
              </p>
              <p>
                If your use case is primarily to interact with Jupyter
                notebooks, keep in mind that CoCalc makes it easy to launch
                industry standard Jupyter Classic (and Jupyter Lab). These
                projects have put substantial deliberate efforts into making
                their products accessible, although they still do not claim to
                have AA compliance with WCAG.
              </p>
              <p>
                For more specific details, please consult our{" "}
                <a href="/documents/SageMathInc_VPAT2.5Rev_WCAG_February2025_December2025.pdf">
                  Voluntary Product Accessibility Template, VPAT®
                </a>{" "}
                (Last Update: December 2025)
              </p>
            </div>
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

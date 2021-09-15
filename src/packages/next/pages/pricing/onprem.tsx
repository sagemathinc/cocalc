import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Layout } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import A from "components/misc/A";

export default function OnPrem({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="CoCalc - On Premises Offerings" />
      <Header page="pricing" subPage="onprem" />
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
            <h1 style={{ fontSize: "28pt" }}>CoCalc - On Premises Offerings</h1>
            <h2>Last Updated: September 15, 2021</h2>
          </div>
          <div style={{ fontSize: "12pt" }}>
            Contact us at <A href="mailto:help@cocalc.com">help@cocalc.com</A>{" "}
            for questions about our commercial on premises offerings.
            <br />
            <br />
            <ul>
              <li style={{ margin: "10px 0" }}>
                <A href="https://github.com/sagemathinc/cocalc-docker/blob/master/README.md">
                  CoCalc-Docker:
                </A>{" "}
                use CoCalc on your own laptop, desktop or server ($999/year).
              </li>
              <li style={{ margin: "10px 0" }}>
                <A href="https://github.com/sagemathinc/cocalc-kubernetes/blob/master/README.md">
                  CoCalc-Kubernetes
                </A>{" "}
                use CoCalc on small Kubernetes cluster ($1499/year)
              </li>
              <li style={{ margin: "10px 0" }}>
                <b>CoCalc-Cloud:</b> we manage CoCalc on your larger Kubernetes
                cluster (<A href="mailto:help@cocalc.com">contact us</A> for
                pricing).
              </li>
            </ul>
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

import { Layout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import SignIn from "components/landing/sign-in";
import Head from "components/landing/head";
import { Icon } from "@cocalc/frontend/components/icon";
import Tables, { Disclaimer } from "components/landing/compare";

const component = "CoCalc";
const title = `Run ${component} Now`;

export default function Octave({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header page="features" subPage="compare" />
        <Layout.Content>
          <div
            style={{
              backgroundColor: "#c7d9f5",
              textAlign: "center",
              padding: "60px 0",
            }}
          >
            <Icon
              style={{ fontSize: "100pt", marginBottom: "50px" }}
              name="table"
            />
            <h1 style={{ fontSize: "26pt" }}>
              Comparing CoCalc to the Competition
            </h1>
            <SignIn startup={"CoCalc"} />
          </div>

          <Disclaimer />

          <Tables />

          <SignIn startup={component} />
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

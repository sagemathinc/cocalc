import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import Image from "components/landing/image";
import { Alert, Layout } from "antd";
import A from "components/misc/A";
import screenshot from "/public/features/cocalc-octave-jupyter-20200511.png";
import { STYLE_PAGE } from ".";
import SoftwareLibraries from "components/landing/software-libraries";

export default function Octave({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Octave Packages in CoCalc" />
      <Header page="software" subPage="octave" />
      <Layout.Content
        style={{
          backgroundColor: "white",
        }}
      >
        <div style={STYLE_PAGE}>
          <h1 style={{ textAlign: "center", fontSize: "32pt", color: "#444" }}>
            GNU Octave Scientific Programming Packages
          </h1>
          <div
            style={{ width: "50%", float: "right", padding: "0 0 15px 15px" }}
          >
            <Image src={screenshot} alt="Using Octave in a Jupyter notebook" />
          </div>
          <p>
            This table lists{" "}
            <A href="https://www.gnu.org/software/octave/">GNU Octave</A>{" "}
            packages that are immediately available to use in any CoCalc
            project, along with their respective version numbers.
          </p>
          <p>If something is missing, you can request that we install it.</p>
          <Alert
            style={{ margin: "15px 0" }}
            message="Learn More"
            description={
              <span style={{ fontSize: "10pt" }}>
                Learn more about{" "}
                <strong>
                  <A href="/features/octave">
                    GNU Octave related functionality in CoCalc
                  </A>
                </strong>
                .
              </span>
            }
            type="info"
            showIcon
          />
          <SoftwareLibraries lang="octave" libWidthPct={60} />;
        </div>
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

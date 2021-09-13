import A from "components/misc/A";
import { Layout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";

export default function Software({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Online Linux Environment" />
      <Layout>
        <Header page="software" />
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
            <h1>Available Software</h1>
            <p>
              These pages contain information about available software on
              CoCalc.
            </p>
            <ul>
              <li>
                <A href="/doc/software-executables">Executables:</A>{" "}
                <span>(subset) of available software on CoCalc</span>
              </li>
              <li>
                <A href="/doc/software-python">Python Libraries:</A>{" "}
                <span>
                  see what libraries in which environments CoCalc offers and
                  their versions
                </span>
              </li>
              <li>
                <A href="/doc/software-r">R Statistical Software Packages:</A>{" "}
                <span>CoCalc maintains an extensive set of R packages</span>
              </li>
              <li>
                <A href="/doc/software-julia">Julia Libraries:</A>{" "}
                <span>installed libraries for Julia</span>
              </li>
              <li>
                <A href="/doc/software-octave">Octave Packages:</A>{" "}
                <span>installed packages for Octave</span>
              </li>
            </ul>
          </div>
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}

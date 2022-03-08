import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import RLibraries from "components/landing/r-libraries";
import Image from "components/landing/image";
import { Alert, Layout } from "antd";
import A from "components/misc/A";
import screenshot from "/public/features/cocalc-r-jupyter.png";

export default function RSoftware({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="R Packages in CoCalc" />
      <Header page="software" subPage="r" />
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
          <h1 style={{ textAlign: "center", fontSize: "32pt", color: "#444" }}>
            Installed R Statistical Software Packages
          </h1>
          <div
            style={{ width: "50%", float: "right", padding: "0 0 15px 15px" }}
          >
            <Image src={screenshot} alt="Using R in a Jupyter notebook" />
          </div>
          <p>
            This table lists all R packages that are{" "}
            <b>immediately available by default in every CoCalc project</b>,
            along with their version numbers. If something is missing, you can{" "}
            <A href="https://doc.cocalc.com/howto/install-r-package.html">
              install it yourself
            </A>
            , or request that we install them.
          </p>
          <Alert
            style={{ margin: "15px 0" }}
            message="Learn More"
            description={
              <span style={{ fontSize: "10pt" }}>
                Learn more about{" "}
                <strong>
                  <A href="/features/r-statistical-software">
                    R functionality in CoCalc
                  </A>
                </strong>
                .
              </span>
            }
            type="info"
            showIcon
          />
          <h2>R Statistical Software Environments</h2>

          <ul>
            <li>
              <b>
                <A href="https://www.r-project.org/">R Project</A>:{" "}
              </b>
              The official R distribution from the R Project, installed
              systemwide.
            </li>
            <li>
              <b>
                <A href="http://doc.sagemath.org/html/en/reference/interfaces/sage/interfaces/r.html">
                  SageMath's R
                </A>
                :{" "}
              </b>
              the R distribution included within SageMath. Start via "R-sage" or
              select the appropriate kernel.
            </li>
          </ul>

          <RLibraries />
        </div>
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

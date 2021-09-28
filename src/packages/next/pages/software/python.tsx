import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import PythonLibraries from "components/landing/python-libraries";
import Image from "components/landing/image";
import { Alert, Layout } from "antd";
import A from "components/misc/A";
import pythonScreenshot from "/public/features/frame-editor-python.png";
import Code from "components/landing/code";

export default function Software({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Python Libraries in CoCalc" />
      <Header page="software" subPage="python" />
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
            Installed Python Libraries
          </h1>
          <div
            style={{ width: "50%", float: "right", padding: "0 0 15px 15px" }}
          >
            <Image
              src={pythonScreenshot}
              alt="Writing and running a Python program"
            />
          </div>
          <p>
            The table below lists available Python libraries for each supported
            environment. If something is missing, you can{" "}
            <A href="https://doc.cocalc.com/howto/install-python-lib.html">
              install it yourself
            </A>
            , or request that we install it.
          </p>
          <Alert
            style={{ margin: "15px 0" }}
            message="Learn More"
            description={
              <span style={{ fontSize: "10pt" }}>
                Learn more about{" "}
                <strong>
                  <A href="/features/python">Python in CoCalc</A>
                </strong>{" "}
                and{" "}
                <strong>
                  <A href="/features/jupyter-notebook">
                    Jupyter Notebook support
                  </A>
                </strong>
                .
              </span>
            }
            type="info"
            showIcon
          />
          <h2>
            <A href="/features/python">Python Environments</A>
          </h2>
          <ul>
            <li>
              <b>
                <A href="https://docs.python.org/3/">Python 3</A>:{" "}
              </b>
              The default system wide Python 3 environment.
            </li>
            <li>
              <b>
                <A href="/features/sage">SageMath</A>:{" "}
              </b>
              The Python environment inside the most recent default system wide
              SageMath instance. Note that several older versions of Sage are
              also available.
            </li>
            <li>
              <b>
                <A href="https://www.anaconda.com/what-is-anaconda/">
                  Anaconda 2020
                </A>
                :{" "}
              </b>
              The Anaconda 2020.02 Python 3 distribution. Select the "Anaconda
              2020" flavored kernel in Jupyter notebooks or execute
              <Code>anaconda2020</Code> in a terminal to start it.
            </li>
            <li>
              <b>
                <A href="https://docs.python.org/2/">Python 2</A>:{" "}
              </b>
              The default system wide Python 2 environment.
            </li>
          </ul>

          <PythonLibraries />
        </div>
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}

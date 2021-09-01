import Link from "next/link";
import { Layout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Content from "components/landing/content";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import SignIn from "components/landing/sign-in";
import Info from "components/landing/info";
import Pitch from "components/landing/pitch";
import Head from "components/landing/head";
import Snapshots from "components/landing/snapshots";

const component = "Python";
const title = `Run ${component} Online`;

export default function Octave({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header />
        <Layout.Content>
          <div style={{ backgroundColor: "#c7d9f5" }}>
            <Content
              startup={component}
              logo={`${component.toLowerCase()}-logo.svg`}
              title={title}
              subtitle={
                <>
                  <div>
                    Run {component} scripts,{" "}
                    <Link href="/doc/jupyter-notebook">
                      <a>Jupyter notebooks</a>
                    </Link>
                    , or even a{" "}
                    <Link href="/doc/x11">
                      <a>graphical application</a>
                    </Link>{" "}
                    in a full, remote {component} environment.
                  </div>
                </>
              }
              image={"frame-editor-python.png"}
            />
          </div>

          <Pitch col1={"col1"} col2={"col2"} />

          <SignIn startup={component} />

          <Info.Heading
            description={
              <>There are many ways to use {component} online via CoCalc.</>
            }
          >
            Feature Overview
          </Info.Heading>

          <Info title="title" icon="square" image="image.png" anchor="a-">
            <p>CoCalc offers...</p>
          </Info>

          <Snapshots />

          <SignIn startup={component} />
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}

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
import A from "components/misc/A";

const component = "X11";
const title = `Run ${component} Online`;

export default function X11({ customize }) {
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
                    <A href="/doc/jupyter-notebook">Jupyter notebooks</A>, or
                    even a <A href="/doc/x11">graphical application</A> in a
                    full, remote {component} environment.
                  </div>
                </>
              }
              image={"frame-editor-python.png"}
              alt={"TODO"}
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

          <Info title="title" icon="square" image="image.png" anchor="a-" alt="TODO">
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

import { Layout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Content from "components/landing/content";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
//import A from "components/misc/A";
import SignIn from "components/landing/sign-in";
import Info from "components/landing/info";
import Pitch from "components/landing/pitch";
import Head from "components/landing/head";
import Snapshots from "components/landing/snapshots";

const component = "API";
const title = "API";

export default function API({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header landing="api" />
        <Layout.Content>
          <div style={{ backgroundColor: "#c7d9f5" }}>
            <Content
              startup={component}
              title={title}
              subtitle={
                <>
                  <div>todo</div>
                </>
              }
              image={"api.png"}
              alt={"Using the API"}
            />
          </div>

          <Pitch col1={"col1"} col2={"col2"} />

          <SignIn startup={component} />

          <Info.Heading
            description={<>There are many ways to use the CoCalc API.</>}
          >
            Feature Overview
          </Info.Heading>

          <Info
            title="title"
            icon="square"
            image="image.png"
            anchor="a-"
            alt={"TODO"}
          >
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

import { Layout, Typography } from "antd";

import { TitleComponent } from "components/about/team";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import IndexList, { DataSource } from "components/landing/index-list";
import A from "components/misc/A";

import { MAX_WIDTH } from "lib/config";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

const dataSource: DataSource = [
  {
    landingPages: true,
    title: "A Man of Academic Origins",
    description: (
      <>
        William’s academic journey began at the University of California,
        Berkeley, where he dedicated immense time and energy to using
        closed-source software like Magma for in-depth analysis and research.
        Though an admirer of its powerful underlying algorithms, William yearned
        for more transparent software that didn’t operate as a “black box.” His
        wish to understand "how things operate under the hood" eventually led
        him to develop <A href="https://www.sagemath.org/">SageMath</A> during
        his time as Assistant Professor of Mathematics at Harvard.
      </>
    ),
  },
] as DataSource;

export default function WilliamStein({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="William Stein"/>
      <Layout>
        <Header page="about" subPage="team"/>
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
            <IndexList
              title={
                <TitleComponent
                  name="William Stein"
                  level={2}
                />
              }
              description={
                <>
                  <Typography.Title level={4}>
                    Chief Executive Officer and Founder of SageMath, Inc.
                    (2015-present)
                  </Typography.Title>
                  <Typography.Paragraph>
                    William is both the CEO and a lead software developer for
                    both the front and back end of CoCalc. His involvement with
                    SageMath development is a testament to his dedication and
                    commitment. His remarkable past career, including a tenure
                    as Professor of Mathematics at the University of Washington,
                    adds depth to his leadership.
                  </Typography.Paragraph>
                </>
              }
              dataSource={dataSource}
            />
          </div>
          <Footer/>
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

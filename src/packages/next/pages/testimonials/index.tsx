/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Layout, Space } from "antd";
import { GetServerSidePropsContext } from "next";
import { join } from "path";

import { Icon } from "@cocalc/frontend/components/icon";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Paragraph, Title } from "components/misc";
import { TESTIMONIALS, TestimonialComponent } from "components/testimonials";
import basePath from "lib/base-path";
import { MAX_WIDTH } from "lib/config";
import { Customize, CustomizeType } from "lib/customize";
import withCustomize from "lib/with-customize";

interface Props {
  customize: CustomizeType;
}

export default function AllNews(props: Props) {
  const { customize } = props;
  const { siteName } = customize;


  function content() {
    return (
      <>
        <Title level={1} style={{ textAlign: "center", margin: "40px 0" }}>
          <Icon name="comments" /> {siteName} Testimonials
        </Title>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          {TESTIMONIALS.map((testimonial, idx) => (
            <TestimonialComponent key={idx} testimonial={testimonial} />
          ))}
        </Space>
        <Paragraph style={{ textAlign: "center", margin: "40px 0" }}>
          <Button
            size="large"
            onClick={() => (window.location.href = join(basePath, "/"))}
            title={`Open the ${siteName} homepage.`}
            type="primary"
          >
            Home
          </Button>
        </Paragraph>
      </>
    );
  }

  return (
    <Customize value={customize}>
      <Head title={`${siteName} Testimonials`} />
      <Layout>
        <Header />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <div
            style={{
              minHeight: "75vh",
              maxWidth: MAX_WIDTH,
              padding: "30px 15px",
              margin: "0 auto",
            }}
          >
            {content()}
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  return await withCustomize({ context });
}

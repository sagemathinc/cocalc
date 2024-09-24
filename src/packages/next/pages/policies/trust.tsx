import { Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { POLICIES } from "components/landing/sub-nav";
import { Paragraph, Text, Title } from "components/misc";
import A from "components/misc/A";
import { MAX_WIDTH } from "lib/config";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

export default function Privacy({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={POLICIES.trust.label} />
      <Layout>
        <Header page="policies" subPage="trust" />
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
            <Title level={1} style={{ textAlign: "center" }}>
              <Icon name="lock-outlined" /> CoCalc - Security and Compliance (
              {POLICIES.trust.label})
            </Title>
            <div style={{ fontSize: "12pt" }}>
              <Title level={2}>SOC 2</Title>
              <Paragraph>
                CoCalc by SageMath, Inc. is{" "}
                <Text strong>
                  <A href="https://www.vanta.com/collection/soc-2/what-is-soc-2">
                    SOC 2 compliant
                  </A>
                </Text>
                , meaning we meet rigorous standards for data security and
                operational integrity. This compliance is verified through
                independent audits, ensuring that we effectively protect
                customer information across security, availability, processing
                integrity, confidentiality, and privacy. Our commitment to these
                high standards enhances trust and reliability for our users.
              </Paragraph>
              <Paragraph>
                Please learn more about the current status in{" "}
                <A href="https://trust.cocalc.com/">
                  Sagemath, Inc.'s Trust Center
                </A>
                .
              </Paragraph>
              <h2>Questions?</h2>
              <Paragraph>
                Please contact us at{" "}
                <A href="mailto:office@sagemath.com">office@sagemath.com</A> if
                you have any questions.
              </Paragraph>
            </div>
          </div>
          <Footer />
        </Layout.Content>{" "}
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

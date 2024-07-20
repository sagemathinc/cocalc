/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Col, Layout, Row } from "antd";

import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import SanitizedMarkdown from "components/misc/sanitized-markdown";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

export default function Imprint({ customize }) {
  const { imprint } = customize;
  return (
    <Customize value={customize}>
      <Head title="Policies" />
      <Layout>
        <Header page="policies" subPage="imprint" />
        <Row>
          <Col
            xs={{ span: 12, offset: 6 }}
            style={{ marginTop: "30px", marginBottom: "30px" }}
          >
            {imprint ? <SanitizedMarkdown value={imprint} /> : undefined}
          </Col>
        </Row>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

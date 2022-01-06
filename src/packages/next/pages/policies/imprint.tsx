/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Row, Col } from "antd";
import withCustomize from "lib/with-customize";
import Header from "components/landing/header";
import Head from "components/landing/head";
import Footer from "components/landing/footer";
import SanitizedMarkdown from "components/misc/sanitized-markdown";
import { Customize } from "lib/customize";

export default function Imprint({ customize }) {
  const { imprint } = customize;
  return (
    <Customize value={customize}>
      <Head title="Policies" />
      <Header page="policies" subPage="imprint" />
      <Row>
        <Col
          xs={{ span: 12, offset: 6 }}
          style={{ marginTop: "30px", marginBottom: "30px" }}
        >
          {imprint && <SanitizedMarkdown value={imprint} />}
        </Col>
      </Row>
      <Footer />
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

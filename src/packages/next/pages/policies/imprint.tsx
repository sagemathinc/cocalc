/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Row, Col } from "antd";
import withCustomize from "lib/with-customize";
import Header from "components/landing/header";
import Head from "components/landing/head";
import Footer from "components/landing/footer";
import { Customize } from "lib/customize";

export default function Imprint({ customize }) {
  const { imprintHTML } = customize;
  return (
    <Customize value={customize}>
      <Head title="Policies" />
      <Header page="policies" subPage="imprint" />
      <Row>
        <Col
          xs={{ span: 12, offset: 6 }}
          style={{ marginTop: "30px", marginBottom: "30px" }}
        >
          <div dangerouslySetInnerHTML={{ __html: imprintHTML }} />
        </Col>
      </Row>
      <Footer />
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

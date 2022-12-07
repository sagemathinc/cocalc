/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import { Layout } from "antd";
import IndexList, { DataSource } from "components/landing/index-list";
import A from "components/misc/A";

const dataSource = [
  {
    link: "/crm/db",
    title: "CRM Database",
    logo: "database",
    description: (
      <>
        Browse and interact with Customer data via our{" "}
        <A href="/crm/db">integrated CRM Database</A>.
        <br />
        <b>NOTE:</b> This relies on <A href="https://nocodb.com/">NocoDB</A>,
        which is AGPL licensed, so may not be installed in your site. Contact us
        to discuss purchasing a non-AGPL license for NocoDB if that is something
        you need.
      </>
    ),
  },
] as DataSource;

export default function CRM({ customize }) {
  const description = customize.onCoCalcCom
    ? `Customer and User Relationship Management for ${customize.siteName} administrators.`
    : "";
  return (
    <Customize value={customize}>
      <Head title="CRM" />
      <Layout>
        <Header page="crm" />
        <IndexList
          title={`${customize.siteName} CRM`}
          description={description}
          dataSource={dataSource}
        />
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Layout } from "antd";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Customize, CustomizeType } from "lib/customize";
import withCustomize from "lib/with-customize";
import useAPI from "lib/hooks/api";
import { Alert } from "antd";

interface Props {
  customize: CustomizeType;
}

export default function TokenActions(props: Props) {
  const { customize } = props;
  const { result, error } = useAPI("token-action");

  return (
    <Customize value={customize}>
      <Head title={"Token Action"} />
      <Layout>
        <Header />
        {error && <Alert type="error" message={error} showIcon />}
        {result && JSON.stringify(result)}
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

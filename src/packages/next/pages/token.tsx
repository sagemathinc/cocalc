/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Visit

    https://cocalc.com/token?vZmCKcIMha2nKyFQ0rgK

to carry out the action associated with the token vZmCKcIMha2nKyFQ0rgK.

TODO: It's probably much better to have a confirmation step before actually
doing the action.  That's just more work to implement, and I'll do it later.
*/

import { Layout } from "antd";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Customize, CustomizeType } from "lib/customize";
import withCustomize from "lib/with-customize";
import useAPI from "lib/hooks/api";
import { Alert, Spin } from "antd";
import { useRouter } from "next/router";

interface Props {
  customize: CustomizeType;
}

export default function TokenActions(props: Props) {
  const { customize } = props;
  const router = useRouter();
  // little bit of a hack taking the key so don't have to write
  //     https://cocalc.com/token?token=vZmCKcIMha2nKyFQ0rgK
  // or name the param at all:
  const token = Object.keys(router.query)[0] ?? "";
  const { calling, result, error } = useAPI("token-action", { token });
  const style = { margin: "30px auto", maxWidth: "600px" };

  return (
    <Customize value={customize}>
      <Head title={"Token Action"} />
      <Layout>
        <Header />
        {calling && (
          <div style={{ ...style, textAlign: "center" }}>
            <Spin />
          </div>
        )}
        {error && <Alert showIcon style={style} type="error" message={error} />}
        {!calling && result != null && !error && (
          <Alert
            showIcon
            style={style}
            type="info"
            message="Success"
            description={result.text}
          />
        )}
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

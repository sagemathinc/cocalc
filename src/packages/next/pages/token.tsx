/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Visit

    https://cocalc.com/token?token=vZmCKcIMha2nKyFQ0rgK&type=...

to carry out the action associated with the token vZmCKcIMha2nKyFQ0rgK.

Also use https://cocalc.com/token?result=.... as a confirmation URL
for payments.

Note that  https://cocalc.com/token?token=vZmCKcIMha2nKyFQ0rgK&type=... is DEPRECATED
and replaced by

   https://cocalc.com/token/vZmCKcIMha2nKyFQ0rgK

which is a cleaner.  We're leaving this deprecated endpoint with a redirect
for a few weeks to handle any outstanding tokens.
*/

import { Layout } from "antd";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Customize, CustomizeType } from "lib/customize";
import withCustomize from "lib/with-customize";
import { Alert } from "antd";
import { useRouter } from "next/router";
import { capitalize } from "@cocalc/util/misc";
import { useEffect } from "react";

const STYLE = { margin: "30px auto", maxWidth: "600px", fontSize: "14pt" };

interface Props {
  customize: CustomizeType;
}

export default function TokenActions(props: Props) {
  const { customize } = props;
  const router = useRouter();

  useEffect(() => {
    if (router.query.token) {
      // redirect due to deprecation
      router.push(`/token/${router.query.token}`);
    }
  }, []);

  return (
    <Customize value={customize}>
      <Head title={getTitle(router.query.type)} />
      <Layout>
        <Header />
        {router.query.result != null && (
          <ShowResult result={router.query.result} />
        )}
        <Footer />
      </Layout>
    </Customize>
  );
}

function ShowResult({ result }) {
  return <Alert showIcon style={STYLE} type="info" message={result} />;
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

function getTitle(type?: string | string[]) {
  switch (type) {
    case "make-payment":
      return "Make a Payment";
    case "disable-daily-statements":
      return "Disable Daily Statements";
    default:
      if (typeof type == "string" && type) {
        return capitalize(type.replace(/-/g, " "));
      }
      return "Token Action";
  }
}

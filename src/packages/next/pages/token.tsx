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
import type { Description } from "@cocalc/util/db-schema/token-actions";
import { capitalize } from "@cocalc/util/misc";

const STYLE = { margin: "30px auto", maxWidth: "600px", fontSize: "14pt" };

interface Props {
  customize: CustomizeType;
}

export default function TokenActions(props: Props) {
  const { customize } = props;
  const router = useRouter();

  return (
    <Customize value={customize}>
      <Head title={getTitle(router.query.type)} />
      <Layout>
        <Header />
        {router.query.result ? (
          <ShowResult result={router.query.result} />
        ) : router.query.token ? (
          <HandleToken token={router.query.token} />
        ) : (
          <div>
            Invalid URL -- should pass a token or result in as a query parameter
          </div>
        )}
        <Footer />
      </Layout>
    </Customize>
  );
}

function ShowResult({ result }) {
  return <Alert showIcon style={STYLE} type="info" message={result} />;
}

function HandleToken({ token }) {
  const { calling, result, error } = useAPI("token-action", { token });

  return (
    <div>
      {calling && (
        <div style={{ ...STYLE, textAlign: "center" }}>
          <Spin />
        </div>
      )}
      {error && <Alert showIcon style={STYLE} type="error" message={error} />}
      {!calling && result != null && !error && (
        <RenderResult description={result.description} data={result.data} />
      )}
    </div>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

function RenderResult({
  description,
  data,
}: {
  description: Description;
  data: any;
}) {
  if (description.type == "make-payment") {
    const { session, instructions } = data;
    return (
      <Alert
        showIcon
        style={STYLE}
        type="warning"
        message="Make a Payment"
        description={<a href={session.url}>{instructions}</a>}
      />
    );
  } else {
    return (
      <Alert
        showIcon
        style={STYLE}
        type="info"
        message="Success"
        description={data?.text}
      />
    );
  }
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

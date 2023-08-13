/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Visit

    https://cocalc.com/token/vZmCKcIMha2nKyFQ0rgK

to carry out the action associated with the token vZmCKcIMha2nKyFQ0rgK.
*/

import { Divider, Layout } from "antd";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Customize, CustomizeType } from "lib/customize";
import withCustomize from "lib/with-customize";
import useAPI from "lib/hooks/api";
import { Alert, Button, Card, Space, Spin } from "antd";
import { useRouter } from "next/router";
import type { Description } from "@cocalc/util/db-schema/token-actions";
import { capitalize } from "@cocalc/util/misc";
import { useState } from "react";
import { getTokenDescription } from "@cocalc/server/token-actions/handle";

const STYLE = { margin: "30px auto", maxWidth: "600px", fontSize: "14pt" };

interface Props {
  customize: CustomizeType;
  token_id: string;
  description: Description;
}

export default function TokenActions({
  customize,
  description,
  token_id,
}: Props) {
  const router = useRouter();
  const [doAction, setDoAction] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [title] = useState<string>(getTitle(description.type));

  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header />
        {doAction ? (
          <HandleToken token={token_id} />
        ) : (
          <Confirm
            loading={loading}
            action={title}
            onConfirm={() => {
              setDoAction(true);
            }}
            onCancel={() => {
              setLoading(true);
              router.push("/");
            }}
          />
        )}
        <pre>{JSON.stringify(description, undefined, 2)}</pre>
        <Footer />
      </Layout>
    </Customize>
  );
}

function Confirm({ action, onConfirm, onCancel, loading }) {
  return (
    <Card
      style={{ margin: "30px auto", minWidth: "400px", maxWidth: "700px" }}
      title={action}
    >
      <Divider />
      <div style={{ float: "right" }}>
        <Space style={{ marginTop: "8px" }}>
          <Button onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            Confirm
          </Button>
          {loading && <Spin />}
        </Space>
      </div>
    </Card>
  );
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

export async function getServerSideProps(context) {
  const { id: token_id } = context.params;
  const description = await getTokenDescription(token_id, true);
  return await withCustomize({ context, props: { token_id, description } });
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

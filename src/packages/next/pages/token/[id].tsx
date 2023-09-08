/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Visit

    https://cocalc.com/token/vZmCKcIMha2nKyFQ0rgK

to carry out the action associated with the token vZmCKcIMha2nKyFQ0rgK.
*/

import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Customize, CustomizeType } from "lib/customize";
import withCustomize from "lib/with-customize";
import useAPI from "lib/hooks/api";
import { Alert, Button, Card, Divider, Layout, Space, Spin } from "antd";
import { useRouter } from "next/router";
import type { Description } from "@cocalc/util/db-schema/token-actions";
import { capitalize } from "@cocalc/util/misc";
import { useState } from "react";
import { getTokenDescription } from "@cocalc/server/token-actions/handle";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import getAccountId from "lib/account/get-account";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";

const STYLE = { margin: "30px auto", maxWidth: "600px", fontSize: "14pt" };

export async function getServerSideProps(context) {
  const { id: token_id } = context.params;
  const account_id = await getAccountId(context.req);
  let description;
  try {
    description = await getTokenDescription(token_id, account_id);
  } catch (error) {
    description = {
      type: "error",
      title: "Error",
      details: `${error}`,
      cancelText: "",
      okText: "OK",
    };
  }
  return await withCustomize({ context, props: { token_id, description } });
}

interface Props {
  customize: CustomizeType;
  token_id: string;
  description: Description & {
    title?: string;
    details?: string;
    okText?: string;
    cancelText?: string;
    icon?: IconName;
    signIn?: boolean;
  };
}

export default function TokenActions({
  customize,
  description,
  token_id,
}: Props) {
  const router = useRouter();
  const [doAction, setDoAction] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const title = getTitle(description);

  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header />
        {!!description.signIn && (
          <div style={{ marginTop: "30px" }}>
            <InPlaceSignInOrUp
              title={"Please create an account (which is very easy) or sign in"}
            />
          </div>
        )}
        <Dialog
          disabled={doAction || !!description.signIn}
          loading={loading}
          title={title}
          details={description.details}
          okText={description.okText}
          cancelText={description.cancelText}
          icon={description.icon}
          onConfirm={() => {
            setDoAction(true);
          }}
          onCancel={() => {
            setLoading(true);
            router.push("/");
          }}
        />
        {!description.signIn && doAction && <HandleToken token={token_id} />}
        <Footer />
      </Layout>
    </Customize>
  );
}

function Dialog({
  disabled,
  title,
  details,
  okText,
  cancelText,
  icon,
  onConfirm,
  onCancel,
  loading,
}) {
  return (
    <Card
      style={{
        margin: "30px auto",
        minWidth: "400px",
        maxWidth: "min(700px,100%)",
      }}
      title={
        <Space>
          {icon && <Icon name={icon} />}
          <Markdown value={title} style={{ marginBottom: "-1em" }} />
        </Space>
      }
    >
      {details && <Markdown value={details} />}
      <Divider />
      <div style={{ float: "right" }}>
        <Space style={{ marginTop: "8px" }}>
          {loading && <Spin />}
          {cancelText != "" && (
            <Button onClick={onCancel} disabled={disabled || loading}>
              {cancelText ?? "Cancel"}
            </Button>
          )}
          {okText != "" && (
            <Button
              onClick={onConfirm}
              disabled={disabled || loading}
              type="primary"
            >
              {okText ?? "Confirm"}
            </Button>
          )}
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
        <RenderResult data={result.data} />
      )}
    </div>
  );
}

function RenderResult({ data }: { data: any }) {
  if (data?.type == "create-credit") {
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
        type="success"
        message="Success!"
        description={data?.text ? <Markdown value={data?.text} /> : undefined}
      />
    );
  }
}

function getTitle({ title, type }: Description & { title?: string }) {
  if (title) {
    return title;
  }
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

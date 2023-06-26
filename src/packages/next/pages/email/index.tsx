/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Card, Layout, Space } from "antd";
import { GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";

import {
  getEmailAddressOfAccount,
  getEmailNotificationSettings,
} from "@cocalc/database/postgres/email";
import { Icon } from "@cocalc/frontend/components/icon";
import getAccountId from "@cocalc/server/auth/get-account";
import { generateEmailSecretToken } from "@cocalc/server/email/utils";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Paragraph, Title } from "components/misc";
import { MAX_WIDTH } from "lib/config";
import { Customize, CustomizeType } from "lib/customize";
import withCustomize from "lib/with-customize";

interface Props {
  customize: CustomizeType;
  error?: string;
  token?: string;
  secret?: string;
  email_address?: boolean;
  needSignIn?: boolean;
}

export default function Email(props: Props) {
  const { customize, error, token, secret, needSignIn } = props;
  const { siteName } = customize;
  const router = useRouter();

  function content() {
    if (needSignIn) {
      return (
        <Card style={{ textAlign: "center" }}>
          <InPlaceSignInOrUp
            why="to see your email notification settings"
            style={{ fontSize: "14pt", width: "450px" }}
            onSuccess={() => {
              router.reload();
            }}
          />
        </Card>
      );
    } else if (error) {
      return <Alert type="error" message={error} />;
    }

    return (
      <>
        <Title level={1}>
          <Icon name="mail" /> {siteName} Email Center
        </Title>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Paragraph>
            Everything about newsletters, announcements, and other email.
          </Paragraph>

          <Paragraph>
            Value: <pre>{JSON.stringify({ token, secret }, null, 2)}</pre>
          </Paragraph>
        </Space>
      </>
    );
  }

  return (
    <Customize value={customize}>
      <Head title={`${siteName} News`} />
      <Layout>
        <Header />
        <Layout.Content
          style={{
            backgroundColor: "white",
          }}
        >
          <div
            style={{
              minHeight: "75vh",
              maxWidth: MAX_WIDTH,
              padding: "30px 15px",
              margin: "0 auto",
            }}
          >
            {content()}
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const { query, req } = context;
  const email_address = typeof query.email === "string" ? query.email : null;
  const token = typeof query.token === "string" ? query.token : null;
  if (!email_address || !token) {
    const account_id = await getAccountId(req);
    if (account_id != null) {
      const email_address = await getEmailAddressOfAccount(account_id);
      const secret = await generateEmailSecretToken({
        account_id,
        email_address,
      });
      return await withCustomize({
        context,
        props: { email_address, token: secret },
      });
    } else {
      return {
        props: {
          needSignIn: true,
          error:
            "You must be logged in or use a link with a secret token in order to see your email notification settings.",
        },
      };
    }
  } else {
    try {
      const notification_settings = await getEmailNotificationSettings({
        email_address,
        token,
      });
      return await withCustomize({
        context,
        props: { email_address, token, notification_settings },
      });
    } catch (err) {
      return {
        props: {
          error: err.message,
        },
      };
    }
  }
}

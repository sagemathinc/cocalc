/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Card, Layout, Space } from "antd";
import { GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";

import { Icon } from "@cocalc/frontend/components/icon";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Paragraph, Title } from "components/misc";
import Loading from "components/share/loading";
import { MAX_WIDTH } from "lib/config";
import { Customize, CustomizeType } from "lib/customize";
import useDatabase from "lib/hooks/database";
import useProfile from "lib/hooks/profile";
import withCustomize from "lib/with-customize";

interface Props {
  customize: CustomizeType;
}

const QUERY = {
  notification_settings: [
    {
      settings: null,
    },
  ],
} as const;

export default function Email(props: Props) {
  const { customize } = props;
  const { siteName } = customize;
  const profile = useProfile({ noCache: true });
  const router = useRouter();
  const { loading, value, error, setError } = useDatabase(QUERY);

  function content() {
    if (profile == null) return <Loading />;

    if (profile != null && !profile.account_id) {
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
          {error && (
            <Alert
              type="error"
              banner={true}
              message={error}
              showIcon
              style={{ width: "100%", marginBottom: "30px" }}
              closable
              onClose={() => setError("")}
            />
          )}
          <Paragraph>Loading: {loading ? <Loading /> : "done"}</Paragraph>
          <Paragraph>
            Value:{" "}
            {value ? <pre>{JSON.stringify(value, null, 2)}</pre> : "none"}
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
  return await withCustomize({ context });
}

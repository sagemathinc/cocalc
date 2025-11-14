/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useEffect, useState } from "react";
import { Alert, Button, Card, Input, Layout, Space, Typography } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Icon } from "@cocalc/frontend/components/icon";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

const { Paragraph, Text, Title } = Typography;

type Status = "idle" | "verifying";

interface Props {
  customize;
  token?: string;
}

export default function EphemeralPage({ customize, token }: Props) {
  const [registrationToken, setRegistrationToken] = useState<string>(
    token ?? "",
  );
  const [status, setStatus] = useState<Status>("idle");
  const [info, setInfo] = useState<string>("");

  useEffect(() => {
    if (token) {
      setRegistrationToken(token);
    }
  }, [token]);

  const disabled = registrationToken.trim().length === 0 || status !== "idle";

  function handleConfirm(): void {
    setStatus("verifying");
    // Placeholder wiring – actual validation happens in the next task.
    setTimeout(() => {
      setStatus("idle");
      setInfo(
        "Token validation isn't wired up yet. Once implemented, this button will create an ephemeral account.",
      );
    }, 250);
  }

  return (
    <Customize value={customize}>
      <Head title="Create Ephemeral Account" />
      <Layout>
        <Header />
        <Layout.Content style={{ backgroundColor: "white", minHeight: "60vh" }}>
          <div
            style={{
              maxWidth: "640px",
              margin: "8vh auto 10vh auto",
              padding: "0 15px",
            }}
          >
            <Card>
              <Space
                direction="vertical"
                style={{ width: "100%" }}
                size="large"
              >
                <Space
                  align="center"
                  direction="vertical"
                  style={{ width: "100%" }}
                >
                  <Icon name="user" style={{ fontSize: "60px" }} />
                  <Title level={2} style={{ marginBottom: 0 }}>
                    Enter Registration Token
                  </Title>
                  <Paragraph style={{ textAlign: "center", marginBottom: 0 }}>
                    Provide the registration token supplied for your exam or
                    event. You can land directly on this page using{" "}
                    <code>/ephemeral?token=YOUR_TOKEN</code>, or paste the code
                    below.
                  </Paragraph>
                </Space>

                <div>
                  <Text strong>Registration Token</Text>
                  <Input
                    allowClear
                    autoFocus
                    size="large"
                    placeholder="abc123..."
                    value={registrationToken}
                    onChange={(e) => {
                      setRegistrationToken(e.target.value);
                      if (info) setInfo("");
                    }}
                    onPressEnter={disabled ? undefined : handleConfirm}
                  />
                </div>

                {info && (
                  <Alert
                    type="info"
                    message={info}
                    showIcon
                    closable
                    onClose={() => setInfo("")}
                  />
                )}

                <Button
                  type="primary"
                  size="large"
                  disabled={disabled}
                  loading={status === "verifying"}
                  onClick={handleConfirm}
                  block
                >
                  Continue
                </Button>

                <Alert
                  type="warning"
                  showIcon
                  message="Ephemeral accounts"
                  description={
                    <Paragraph style={{ marginBottom: 0 }}>
                      Ephemeral accounts automatically expire after the duration
                      configured with their registration token. You will be
                      signed in automatically and redirected to your workspace
                      as soon as token verification is implemented.
                    </Paragraph>
                  }
                />
              </Space>
            </Card>
          </div>
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const token =
    typeof context?.query?.token === "string" ? context.query.token : "";
  return await withCustomize({
    context,
    props: { token },
  });
}

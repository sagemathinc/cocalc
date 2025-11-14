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
import apiPost from "lib/api/post";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import { useRouter } from "next/router";

const { Paragraph, Text, Title } = Typography;

type Status = "idle" | "verifying" | "redirecting";

interface Props {
  customize;
  token?: string;
}

export default function EphemeralPage({ customize, token }: Props) {
  const router = useRouter();
  const [registrationToken, setRegistrationToken] = useState<string>(
    token ?? "",
  );
  const [status, setStatus] = useState<Status>("idle");
  const [info, setInfo] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (token) {
      setRegistrationToken(token);
    }
  }, [token]);

  const trimmedToken = registrationToken.trim();
  const working = status !== "idle";
  const disabled = trimmedToken.length === 0 || working;

  async function handleConfirm(): Promise<void> {
    if (disabled) return;
    setStatus("verifying");
    setInfo("");
    setError("");
    try {
      await apiPost("/auth/ephemeral", {
        registrationToken: trimmedToken,
      });
      setStatus("redirecting");
      setInfo("Success! Redirecting you to your workspace…");
      await router.push("/app");
    } catch (err) {
      setError(err?.message ?? `${err}`);
      setStatus("idle");
    }
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
                      if (error) setError("");
                    }}
                    onPressEnter={disabled ? undefined : handleConfirm}
                  />
                </div>

                {error && (
                  <Alert
                    type="error"
                    message="Unable to create account"
                    description={error}
                    showIcon
                    closable
                    onClose={() => setError("")}
                  />
                )}

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
                  loading={working}
                  onClick={handleConfirm}
                  block
                >
                  {status === "redirecting" ? "Redirecting…" : "Continue"}
                </Button>

                <Alert
                  type="warning"
                  showIcon
                  message="Ephemeral accounts"
                  description={
                    <Paragraph style={{ marginBottom: 0 }}>
                      Ephemeral accounts automatically expire after the duration
                      configured with their registration token. When the token
                      is valid you'll be signed in automatically and redirected
                      to your workspace with a cookie that expires at the same
                      time.
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

/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Button, Descriptions, Dropdown, Layout } from "antd";
import { GetServerSidePropsContext } from "next";
import { useState } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import { EmailTemplateSendResult } from "@cocalc/server/email/templates";
import {
  EmailTemplateName,
  TEMPLATE_NAMES,
} from "@cocalc/server/email/templates-data";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Paragraph } from "components/misc";
import A from "components/misc/A";
import Loading from "components/share/loading";
import apiPost from "lib/api/post";
import { MAX_WIDTH } from "lib/config";
import { Customize, CustomizeType } from "lib/customize";
import useProfile from "lib/hooks/profile";
import withCustomize from "lib/with-customize";
import { COLORS } from "@cocalc/util/theme";

interface Props {
  customize: CustomizeType;
}

export default function TestEmail(props: Props) {
  const { customize } = props;
  const { siteName } = customize;
  const profile = useProfile();
  const [template, setTemplate] = useState<EmailTemplateName>("welcome");
  const [sending, setSending] = useState<boolean>(false);
  const [result, setResult] = useState<EmailTemplateSendResult | null>(null);

  async function sendTestEmail() {
    if (profile == null) {
      setResult({ status: "error", value: { error: "profile is null" } });
      return;
    }
    setSending(true);
    try {
      const ret = await apiPost("email/test", {
        test: true,
        email_address: profile.email_address,
        name: `${profile.first_name} ${profile.last_name}`,
        template,
      });
      setResult(ret);
    } catch (err) {
      setResult(err);
    } finally {
      setSending(false);
    }
  }

  function renderResult() {
    if (result == null) return null;
    const { status, value } = result;
    switch (status) {
      case "test":
        const { url, comment } = value.list.unsubscribe;
        return (
          <>
            <Paragraph>Email to be sent:</Paragraph>
            <Descriptions size="small" title="User Info" bordered column={1}>
              <Descriptions.Item label="From">{value.from}</Descriptions.Item>
              <Descriptions.Item label="To">{value.to}</Descriptions.Item>
              <Descriptions.Item label="Subject">
                {value.subject}
              </Descriptions.Item>
              <Descriptions.Item label="Unsubscribe">
                <A href={url}>{comment}</A>
              </Descriptions.Item>
              <Descriptions.Item label="HTML">
                <iframe
                  width={800}
                  height={700}
                  srcDoc={value.html ?? "NO HTML"}
                  style={{
                    border: `1px solid ${COLORS.GRAY_M}`,
                    borderRadius: 5,
                  }}
                />
              </Descriptions.Item>
              <Descriptions.Item label="raw HTML">
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: "70%",
                    fontFamily: "monospace",
                  }}
                >
                  {value.html ?? "NO HTML"}
                </pre>
              </Descriptions.Item>
              <Descriptions.Item label="Text">
                <pre>{value.text}</pre>
              </Descriptions.Item>
            </Descriptions>
          </>
        );

      default:
        return (
          <Paragraph>
            <b>Error</b>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </Paragraph>
        );
    }
  }

  function renderTest() {
    if (profile == null) throw new Error("profile is null");
    return (
      <>
        <Paragraph>test. email: {profile.email_address}</Paragraph>
        <Paragraph>
          <Dropdown.Button
            icon={<Icon name="caret-down" />}
            menu={{
              items: TEMPLATE_NAMES.map((t) => ({
                label: t,
                key: t,
                onClick: () => {
                  setTemplate(t);
                },
              })),
            }}
          >
            {template}
          </Dropdown.Button>
        </Paragraph>
        <Paragraph>
          <Button disabled={sending} onClick={sendTestEmail}>
            Send Test Email
          </Button>
        </Paragraph>
        {renderResult()}
      </>
    );
  }

  function renderBody() {
    if (profile == null) return <Loading large center />;
    if (!profile.is_admin) {
      return (
        <Alert
          showIcon
          banner
          style={{ margin: "30%" }}
          type="error"
          message={<b>This page is only for admins.</b>}
        />
      );
    }
    return renderTest();
  }

  return (
    <Customize value={customize}>
      <Head title={`${siteName} Email Testing`} />
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
            {renderBody()}
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

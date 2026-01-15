/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import { useRouter } from "next/router";
import { join } from "path";
import { CSSProperties, ReactNode } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import SSO from "components/auth/sso";
import { Paragraph } from "components/misc";
import basePath from "lib/base-path";
import { useCustomize } from "lib/customize";

interface Props {
  startup?: ReactNode; // customize the button, e.g. "Start Jupyter Now".
  hideFree?: boolean;
  style?: React.CSSProperties;
  emphasize?: boolean;
}

const STYLE: CSSProperties = {
  textAlign: "center",
  padding: "30px 15px",
  marginBottom: "0",
} as const;

export default function SignIn({ hideFree, style, emphasize }: Props) {
  const { siteName, account, emailSignup } = useCustomize();
  style = { ...STYLE, ...style };
  const router = useRouter();

  if (account != null) {
    return (
      <Paragraph style={style}>
        <Button
          size="large"
          onClick={() => (window.location.href = join(basePath, "projects"))}
          title={`Open the ${siteName} app and view your projects.`}
          type="primary"
          icon={<Icon name="edit" />}
        >
          Your {siteName} Projects
        </Button>
      </Paragraph>
    );
  }

  // if email signup is not allowed, we show all SSO options -- #7557
  function renderAccountRegistration() {
    if (emailSignup) {
      return (
        <>
          <Button
            size="large"
            style={{ margin: "10px" }}
            title={"Create a new account."}
            onClick={() => router.push("/auth/sign-up")}
            type={emphasize ? "primary" : undefined}
          >
            Sign Up
          </Button>
          <Button
            size="large"
            style={{ margin: "10px" }}
            title={
              "Either create a new account or sign into an existing account."
            }
            onClick={() => router.push("/auth/sign-in")}
            type={emphasize ? "primary" : undefined}
          >
            Sign In
          </Button>
        </>
      );
    } else {
      return (
        <SSO
          header={
            <Paragraph style={{ fontSize: "18px", fontWeight: "bold" }}>
              Sign in
            </Paragraph>
          }
          showAll={true}
          showName={true}
        />
      );
    }
  }

  return (
    <Paragraph style={style}>
      {renderAccountRegistration()}
      {!hideFree ? (
        <div style={{ padding: "15px 0 0 0" }}>
          Start free today. Upgrade later.
        </div>
      ) : undefined}
    </Paragraph>
  );
}

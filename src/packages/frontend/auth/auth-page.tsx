import { Card, Typography } from "antd";

import { React, useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { SiteName } from "@cocalc/frontend/customize";
import { set_url } from "@cocalc/frontend/history";
import { SITE_NAME } from "@cocalc/util/theme";
import type { AuthView } from "./types";
import SignInForm from "./sign-in";
import SignUpForm from "./sign-up";
import PasswordResetForm from "./password-reset";

const PAGE_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100%",
  padding: "40px 16px",
  background: "#f7f7f9",
} as const;

const CARD_STYLE: React.CSSProperties = {
  width: "min(480px, 96vw)",
  borderRadius: "12px",
  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.08)",
} as const;

const TITLE_STYLE: React.CSSProperties = {
  marginBottom: "12px",
} as const;

function viewTitle(view: AuthView, siteName: string): string {
  switch (view) {
    case "sign-up":
      return `Create your ${siteName} account`;
    case "password-reset":
      return `Reset your ${siteName} password`;
    case "sign-in":
    default:
      return `Sign in to ${siteName}`;
  }
}

function viewPath(view: AuthView): string {
  switch (view) {
    case "sign-up":
      return "/auth/sign-up";
    case "password-reset":
      return "/auth/password-reset";
    case "sign-in":
    default:
      return "/auth/sign-in";
  }
}

export default function AuthPage() {
  const page_actions = useActions("page");
  const auth_view = useTypedRedux("page", "auth_view") ?? "sign-in";
  const site_name = useTypedRedux("customize", "site_name") ?? SITE_NAME;

  function onNavigate(next: AuthView) {
    page_actions.setState({ active_top_tab: "auth", auth_view: next });
    set_url(viewPath(next));
  }

  return (
    <div style={PAGE_STYLE}>
      <Card style={CARD_STYLE} bodyStyle={{ padding: "32px" }}>
        <Typography.Title level={3} style={TITLE_STYLE}>
          {viewTitle(auth_view, site_name)}
        </Typography.Title>
        <Typography.Text type="secondary">
          <SiteName />
        </Typography.Text>
        <div style={{ marginTop: "24px" }}>
          {auth_view === "sign-up" && <SignUpForm onNavigate={onNavigate} />}
          {auth_view === "password-reset" && (
            <PasswordResetForm onNavigate={onNavigate} />
          )}
          {auth_view === "sign-in" && <SignInForm onNavigate={onNavigate} />}
        </div>
      </Card>
    </div>
  );
}

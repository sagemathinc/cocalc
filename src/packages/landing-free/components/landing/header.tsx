import SquareLogo from "./logo-square";
import A from "components/misc/A";
import { join } from "path";
import { Layout } from "antd";
import { useCustomize } from "lib/customize";
import { basePath } from "lib/base-path";

const GAP = "32px";

const LinkStyle = {
  color: "white",
  marginRight: GAP,
  display: "inline-block",
};

export default function Header() {
  const {
    anonymousSignup,
    helpEmail,
    siteName,
    termsOfServiceURL,
    shareServer,
  } = useCustomize();
  if (basePath == null) return null;

  return (
    <Layout.Header
      style={{
        minHeight: "64px",
        height: "auto",
        lineHeight: "32px",
        padding: "16px",
        textAlign: "center",
      }}
    >
      <SquareLogo style={{ height: "40px", marginRight: GAP }} />
      {anonymousSignup && (
        <a
          style={LinkStyle}
          href={join(basePath, "static/app.html?anonymous=jupyter")}
          title={`Try ${siteName} immediately without creating an account.`}
        >
          Try {siteName}
        </a>
      )}
      {shareServer && (
        <a
          style={LinkStyle}
          href={join(basePath, "share")}
          title="View files that people have published."
        >
          Published Files
        </a>
      )}
      {termsOfServiceURL && (
        <A
          style={LinkStyle}
          href={termsOfServiceURL}
          title="View the terms of service and other legal documents."
        >
          Legal
        </A>
      )}
      {helpEmail && (
        <A
          style={LinkStyle}
          href={`mailto:${helpEmail}`}
          title={`Ask us a question via email to ${helpEmail}.`}
        >
          Help
        </A>
      )}
      <A
        style={LinkStyle}
        href="https://doc.cocalc.com"
        title="View the CoCalc documenation."
      >
        Documentation
      </A>
      <a
        style={LinkStyle}
        href={join(basePath, "static/app.html")}
        title={`Sign in to ${siteName} or create an account.`}
      >
        Sign In
      </a>
    </Layout.Header>
  );
}

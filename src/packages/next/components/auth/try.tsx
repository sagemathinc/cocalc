import { Button } from "antd";
import SquareLogo from "components/logo-square";
import useCustomize from "lib/use-customize";
import { LOGIN_STYLE } from "./shared";
import A from "components/misc/A";
import basePath from "lib/base-path";
import { join } from "path";

export default function Try() {
  const { siteName, anonymousSignup } = useCustomize();

  if (!anonymousSignup) {
    return (
      <h1 style={{ textAlign: "center", margin: "45px auto" }}>
        Anonymous Trial of {siteName} Not Currently Available
      </h1>
    );
  }

  return (
    <div style={{ padding: "0 15px 30px 15px" }}>
      <div style={{ textAlign: "center", marginBottom: "15px" }}>
        <SquareLogo
          style={{ width: "100px", height: "100px", marginBottom: "15px" }}
        />
        <h1>Use {siteName} Anonymously</h1>
      </div>

      <div style={LOGIN_STYLE}>
        Try {siteName} out <b>without</b>{" "}
        <A href="/auth/sign-up">creating an account</A> or{" "}
        <A href="/auth/sign-in">signing in</A>!
        <Button
          shape="round"
          size="large"
          type="primary"
          style={{ width: "100%", marginTop: "20px" }}
          href={join(basePath, "static/app.html?anonymous=jupyter")}
        >
          Use {siteName} Anonymously
        </Button>
      </div>
      <div
        style={{
          ...LOGIN_STYLE,
          backgroundColor: "white",
          margin: "30px auto",
          padding: "15px",
        }}
      >
        Already have an account? <A href="/auth/sign-in">Sign In</A>
        <div style={{ marginTop: "15px" }}>
          Need an account? <A href="/auth/sign-up">Sign Up</A>
        </div>
      </div>
    </div>
  );
}

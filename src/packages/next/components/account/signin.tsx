import { Button, Input } from "antd";
import { useState } from "react";
import SquareLogo from "components/logo-square";
import useCustomize from "lib/use-customize";
import A from "components/misc/A";
import SSO from "./sso";
import { LOGIN_STYLE } from "./shared";
import apiPost from "lib/api/post";

export default function SignIn() {
  const { siteName } = useCustomize();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");

  return (
    <div style={{ padding: "0 15px" }}>
      <div style={{ textAlign: "center", marginBottom: "15px" }}>
        <SquareLogo style={{ width: "100px", height: "100px" }} />
        <h1>Sign In to {siteName}</h1>
      </div>

      <div style={LOGIN_STYLE}>
        <div style={{ margin: "10px 0" }}>
          Email address or{" "}
          <div
            style={{ float: "right", marginBottom: "15px", marginTop: "-10px" }}
          >
            <SSO />
          </div>
        </div>
        <form>
          <Input
            placeholder="Email address"
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
          />
          {email && (
            <div style={{ marginTop: "30px" }}>
              <p>
                Password{" "}
                <A style={{ float: "right" }} href="/password_reset">
                  Forgot password?
                </A>
              </p>
              <Input.Password
                autoComplete="current-password"
                placeholder="Password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          {password && (
            <Button
              shape="round"
              size="large"
              type="primary"
              style={{ width: "100%", marginTop: "20px" }}
              onClick={() => signIn(email, password)}
            >
              Sign In
            </Button>
          )}
        </form>
      </div>

      <div
        style={{
          ...LOGIN_STYLE,
          backgroundColor: "white",
          marginTop: "30px",
          marginBottom: "30px",
        }}
      >
        <p>
          New to {siteName}? <A href="/signup">Sign Up</A>
        </p>
        Unsure? <A href="/try">Try {siteName} without creating an account</A>
      </div>
    </div>
  );
}

async function signIn(email, password) {
  const result = await apiPost("account/signin", { email, password });
  console.log("result = ", result);
}

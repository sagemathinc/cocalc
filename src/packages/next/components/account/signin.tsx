import { Button, Input } from "antd";
import { useState } from "react";
import SquareLogo from "components/logo-square";
import useCustomize from "lib/use-customize";
import A from "components/misc/A";
import SSO from "./sso";
import { LOGIN_STYLE } from "./shared";

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
        <p style={{ marginTop: "10px" }}>
          Email address or{" "}
          <div
            style={{ float: "right", marginBottom: "15px", marginTop: "-10px" }}
          >
            <SSO />
          </div>
        </p>
        <Input
          placeholder="Email address"
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

function signIn(email, password) {
  console.log("sign in using ", { email, password });
}

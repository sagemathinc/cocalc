import { Button, Input } from "antd";
import { CSSProperties, useState } from "react";
import SquareLogo from "components/logo-square";
import useCustomize from "lib/use-customize";
import A from "components/misc/A";
import { Icon } from "@cocalc/frontend/components/icon";

const BOX_STYLE = {
  maxWidth: "400px",
  margin: "auto",
  border: "1px solid lightgrey",
  borderRadius: "5px",
  padding: "20px",
  backgroundColor: "#fafafa",
  fontSize: "12pt",
} as CSSProperties;

export default function SignIn() {
  const { siteName } = useCustomize();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");

  return (
    <>
      <div style={{ textAlign: "center", marginBottom: "15px" }}>
        <SquareLogo style={{ width: "100px", height: "100px" }} />
        <h1>Sign in to {siteName}</h1>
      </div>

      <div style={BOX_STYLE}>
        <p style={{ marginTop: "10px" }}>
          Email address or{" "}
          <div
            style={{ float: "right", marginBottom: "15px", marginTop: "-10px" }}
          >
            <Google /> <GitHub /> <Twitter /> <Facebook />
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
            type="primary"
            style={{ width: "100%", marginTop: "20px" }}
            onClick={() => signIn(email, password)}
          >
            Sign in
          </Button>
        )}
      </div>

      <div
        style={{
          ...BOX_STYLE,
          backgroundColor: "white",
          marginTop: "30px",
          marginBottom: "30px",
        }}
      >
        New to {siteName}? <A href="/signup">Create an account</A> or{" "}
        <A href="/try">try {siteName} without creating an account</A>.
      </div>
    </>
  );
}

const SSO = {
  fontSize: "42px",
  color: "white",
  margin: "0 2px",
} as CSSProperties;

function Facebook() {
  return (
    <a href="" title={"Sign in using Facebook"}>
      <Icon name="facebook" style={{ ...SSO, backgroundColor: "#428bca" }} />
    </a>
  );
}

function GitHub() {
  return (
    <a href="" title={"Sign in using GitHub"}>
      <Icon name="github" style={{ ...SSO, backgroundColor: "black" }} />
    </a>
  );
}

function Google() {
  return (
    <a href="" title={"Sign in using Google"}>
      <Icon
        name="google"
        style={{ ...SSO, backgroundColor: "rgb(220, 72, 57)" }}
      />
    </a>
  );
}

function Twitter() {
  return (
    <a href="" title={"Sign in using Twitter"}>
      <Icon
        name="twitter"
        style={{ ...SSO, backgroundColor: "rgb(85, 172, 238)" }}
      />
    </a>
  );
}

function signIn(email, password) {
  console.log("sign in using ", { email, password });
}

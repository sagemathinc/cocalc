import { Button } from "antd";
import SquareLogo from "components/logo-square";
import useCustomize from "lib/use-customize";
import { LOGIN_STYLE } from "./shared";
import A from "components/misc/A";

export default function Try() {
  const { siteName } = useCustomize();

  return (
    <div style={{ padding: "0 15px 30px 15px" }}>
      <div style={{ textAlign: "center", marginBottom: "15px" }}>
        <SquareLogo style={{ width: "100px", height: "100px" }} />
        <h1>Use {siteName} Anonymously</h1>
      </div>

      <div style={LOGIN_STYLE}>
        <p>
          <Button
            shape="round"
            size="large"
            type="primary"
            style={{ width: "100%", marginTop: "20px" }}
            href="static/app.html?anonymous=jupyter"
          >
            Use {siteName} Anonymously
          </Button>
        </p>
        <p>
          Try {siteName} out <b>without</b> <A href="/signup">creating an account</A>{" "}
          or <A href="/signin">signing in</A>!
        </p>
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
          Already have an account? <A href="/signin">Sign In</A>
        </p>
        Need an account? <A href="/signup">Sign Up</A>
      </div>
    </div>
  );
}

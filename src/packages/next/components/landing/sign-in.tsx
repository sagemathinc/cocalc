import { join } from "path";
import { useCustomize } from "lib/customize";
import basePath from "lib/base-path";
import { ReactNode } from "react";

interface Props {
  startup?: ReactNode; // customize the button, e.g. "Start Jupyter Now".
  hideFree?: boolean;
}

export default function SignIn({ startup, hideFree }: Props) {
  const { anonymousSignup, siteName } = useCustomize();
  return (
    <div style={{ textAlign: "center", padding: "30px 15px" }}>
      {/* We use className="ant-btn" instead of an actual Button, because otherwise
            we get a ton of useLayoutEffects due to server-side rendering.*/}
      {anonymousSignup && (
        <a
          className="ant-btn"
          style={{
            backgroundColor: "#5cb85c",
            borderColor: "#4cae4c",
            color: "white",
          }}
          href={join(basePath, "static/app.html?anonymous=jupyter")}
          title={"Try now without creating an account!"}
        >
          Run {startup ?? siteName} Now
        </a>
      )}
      <a
        className="ant-btn"
        href={join(basePath, "static/app.html")}
        style={{ margin: "15px" }}
        title={"Either create a new account or sign into an existing account."}
      >
        Create Account or Sign In
      </a>
      {!hideFree && (
        <>
          <br />
          Start free today. Upgrade later.
        </>
      )}
    </div>
  );
}

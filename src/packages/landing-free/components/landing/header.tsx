import SquareLogo from "./logo-square";
import RectangularLogo from "./logo-rectangular";
import customize from "lib/customize";
import A from "components/misc/A";
import { join } from "path";

const HeaderStyle = {
  // Inspired by nextjs.org's header.
  position: "sticky",
  top: 0,
  zIndex: 1000,
  background: "#fff",
  display: "flex",
  flexDirection: "row",
  justifyContent: "center",
  alignItems: "center",
  width: "100%",
  padding: "15px",
};

const LinkStyle = { color: "#666", marginRight: "30px" };

export default function Header() {
  const { anonymousSignup, basePath, helpEmail, siteName, termsOfServiceURL } =
    customize;
  return (
    <>
      <div style={{ width: "100%" }}>
        <div
          style={{
            color: "#fff",
            width: "100%",
            background: "#444",
            padding: "5px 15px",
            display: "flex",
          }}
        >
          {anonymousSignup && (
            <a
              style={{ color: "#fff" }}
              href={join(basePath, "static/app.html")}
            >
              Try {siteName} without an account
            </a>
          )}

          <div style={{ flex: 1 }}></div>

          <a style={{ color: "#fff" }} href={join(basePath, "static/app.html")}>
            Sign Up
          </a>
        </div>
      </div>
      <header style={HeaderStyle}>
        <SquareLogo style={{ height: "40px" }} />
        <div style={{ width: "15px" }} />
        <RectangularLogo style={{ height: "24px" }} />
        <div style={{ flex: 1 }}></div>
        {termsOfServiceURL && (
          <A style={LinkStyle} href={termsOfServiceURL}>
            Terms of Service
          </A>
        )}
        {helpEmail && (
          <A style={LinkStyle} href={`mailto:${helpEmail}`}>
            Help
          </A>
        )}
        <A style={LinkStyle} href={join(basePath, "share")}>
          Published Files
        </A>
        <A style={LinkStyle} href="https://doc.cocalc.com">
          Doc
        </A>
        <a style={LinkStyle} href={join(basePath, "static/app.html")}>
          Sign In
        </a>
      </header>
    </>
  );
}

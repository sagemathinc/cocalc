export { useCustomize } from "lib/customize";
import { Customize as CustomizeContext } from "lib/customize";
import SiteName from "components/share/site-name";
import Link from "next/link";

export function Customize({ value, children }) {
  if (!value.shareServer) {
    return <ShareServerIsDisabled value={value} />;
  }
  return <CustomizeContext value={value}>{children}</CustomizeContext>;
}

function ShareServerIsDisabled({ value }) {
  const { siteName, helpEmail } = value;
  return (
    <div style={{ margin: "30px", fontSize: "12pt" }}>
      <h1>
        Browsing of publicly shared paths is currently disabled on{" "}
        <Link href="/">
          <a>{siteName ?? "this server"}</a>
        </Link>
        .
      </h1>
      <br />
      {helpEmail && (
        <div>
          Contact <a href={`mailto:${helpEmail}`}>{helpEmail}</a> for help.
        </div>
      )}
    </div>
  );
}

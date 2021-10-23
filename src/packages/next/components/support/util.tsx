import { Alert } from "antd";
import Contact from "components/landing/contact";
import { useCustomize } from "lib/customize";

export function NoZendesk() {
  const { contactEmail } = useCustomize();

  return (
    <Alert
      type="error"
      message="Zendesk Support is not configured."
      style={{ margin: "30px auto", maxWidth: "400px", fontSize: "13pt" }}
      description={
        contactEmail && (
          <>
            You can still <Contact lower />.
          </>
        )
      }
    />
  );
}

export function Placeholder({ children }) {
  // This is because the placeholder text that antd uses is WAY
  // too light, according to Google's Lighthouse accessibility score.
  return <span style={{ color: "#888" }}>{children}</span>;
}

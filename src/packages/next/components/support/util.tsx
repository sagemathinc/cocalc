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

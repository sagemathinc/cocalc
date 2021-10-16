import apiPost from "lib/api/post";
import { useEffect, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { Alert } from "antd";
import SquareLogo from "components/logo-square";
import { LOGIN_STYLE } from "./shared";
import Contact from "components/landing/contact";

interface Props {
  token: string;
  email_address: string;
}

export default function RedeemVerifyEmail({ token, email_address }: Props) {
  const [redeeming, setRedeeming] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  async function redeem(): Promise<void> {
    setRedeeming(true);
    setError("");
    setSuccess("");
    try {
      const result = await apiPost("/auth/redeem-verify-email", {
        email_address,
        token,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess("Successfully verified your email address. Thanks!");
      }
    } catch (err) {
      setError(`${err}`);
    } finally {
      setRedeeming(false);
    }
  }

  useEffect(() => {
    redeem();
    return;
  }, []);

  function Body() {
    if (redeeming) {
      return (
        <div>
          <Icon name="spinner" spin /> Verifying your email address...
        </div>
      );
    }
    return (
      <div>
        {error && (
          <Alert
            style={{ marginTop: "20px" }}
            message="Error"
            description={
              <div style={{ fontSize: "12pt" }}>
                <b>{error}</b><br/>If you are stuck <Contact lower />.
              </div>
            }
            type="error"
            showIcon
          />
        )}
        {success && (
          <Alert
            style={{ marginTop: "20px" }}
            message={<b>Success</b>}
            description={<div style={{ fontSize: "12pt" }}>{success}</div>}
            type="success"
            showIcon
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: "15px" }}>
      <div style={{ textAlign: "center", marginBottom: "15px" }}>
        <SquareLogo style={{ width: "100px", height: "100px" }} />
        <h1>
          {success ? "Successfully " : ""}Verif{success ? "ied" : "y"} Your
          Email Address
        </h1>
      </div>
      <div style={LOGIN_STYLE}>
        <Body />
      </div>
    </div>
  );
}

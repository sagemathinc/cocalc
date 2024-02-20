import apiPost from "lib/api/post";
import { useEffect, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { Alert } from "antd";
import Contact from "components/landing/contact";

import AuthPageContainer from "./fragments/auth-page-container";

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
      await apiPost("/auth/redeem-verify-email", {
        email_address,
        token,
      });
      setSuccess("Successfully verified your email address. Thanks!");
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
    if (error) {
      return (
        <div>
          We weren't able to validate your e-mail address. ):
        </div>
      );
    }
    return (
      <div>
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

  function renderError() {
    return error && (
      <div style={{ fontSize: "12pt" }}>
        <b>{error}</b>
        <br/>
        If you are stuck, please <Contact lower/>.
      </div>
    );
  }

  function renderTitle() {
    return `${success ? "Successfully " : ""}Verif${success ? "ied" : "y"} Your Email Address`;
  }

  return (
    <AuthPageContainer
      error={renderError()}
      title={renderTitle()}
    >
      <div style={{ marginTop: "8px" }}>
        <Body/>
      </div>
    </AuthPageContainer>
);
}

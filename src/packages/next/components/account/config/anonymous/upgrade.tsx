/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Input, Space } from "antd";
import { delay } from "awaiting";
import { CSSProperties, useState } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import { MIN_PASSWORD_LENGTH } from "@cocalc/util/auth";
import { is_valid_email_address as isValidEmailAddress } from "@cocalc/util/misc";
import { TermsCheckbox } from "components/auth/sign-up";
import SSO from "components/auth/sso";
import { Title } from "components/misc";
import apiPost from "lib/api/post";
import { useRouter } from "next/router";

interface Props {
  style: CSSProperties;
}

export default function Upgrade({ style }: Props) {
  const [terms, setTerms] = useState<boolean>(false);
  return (
    <div style={style}>
      <TermsCheckbox onChange={setTerms} checked={terms} />
      <br />
      <br />
      {terms && <EmailPassword />}
      <br />
      <br />
      {terms && (
        <SSO
          style={{ margin: "30px 0" }}
          header={<Title level={3}>Or Use Single Sign On</Title>}
        />
      )}
    </div>
  );
}

function EmailPassword() {
  const router = useRouter();
  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [email_address, setEmailAddress] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  async function setEmailAndPassword() {
    setError("");
    try {
      await apiPost("/accounts/set-email-address", {
        email_address,
        password,
      });
      setSuccess(true);
      // send them to configure their name, which is a good next step...
      router.push("/config/account/name");
      await delay(1000);
      // need to force reload to know that they are no longer anonymous.
      router.reload();
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <>
      <Title level={3}>Set an Email Address and Password</Title>
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginTop: "15px" }}
        />
      )}
      <Space style={{ width: "100%" }}>
        <Input
          disabled={success}
          style={{ fontSize: "12pt" }}
          placeholder="Email address"
          autoComplete="username"
          value={email_address}
          onChange={(e) => {
            setEmailAddress(e.target.value);
            setError("");
          }}
        />
        <Input.Password
          disabled={success}
          style={{ fontSize: "12pt" }}
          value={password}
          placeholder="Password"
          autoComplete="new-password"
          onChange={(e) => {
            setPassword(e.target.value);
            setError("");
          }}
          onPressEnter={setEmailAndPassword}
        />
        {/* change height of button to match input boxes */}
        <Button
          type="primary"
          disabled={
            success || !email_address || password.length < MIN_PASSWORD_LENGTH
          }
          style={{ height: "35px" }}
          onClick={setEmailAndPassword}
        >
          {success ? (
            <>
              <Icon name="check" style={{ marginRight: "5px" }} /> Saved
            </>
          ) : email_address.length > 0 &&
            !isValidEmailAddress(email_address) ? (
            "Enter valid email"
          ) : password.length > 0 && password.length < MIN_PASSWORD_LENGTH ? (
            `At least ${MIN_PASSWORD_LENGTH} characters`
          ) : (
            <>
              <Icon name="check" style={{ marginRight: "5px" }} /> Save
            </>
          )}
        </Button>
      </Space>
    </>
  );
}

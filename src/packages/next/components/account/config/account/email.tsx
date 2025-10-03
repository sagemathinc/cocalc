/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Input, Space } from "antd";
import { useEffect, useMemo, useState, type JSX } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import { MIN_PASSWORD_LENGTH } from "@cocalc/util/auth";
import { is_valid_email_address as isValidEmailAddress } from "@cocalc/util/misc";
import { Paragraph, Text, Title } from "components/misc";
import SaveButton from "components/misc/save-button";
import Timestamp from "components/misc/timestamp";
import Loading from "components/share/loading";
import apiPost from "lib/api/post";
import { useCustomize } from "lib/customize";
import useAPI from "lib/hooks/api";
import useDatabase from "lib/hooks/database";
import register from "../register";

interface Data {
  email_address?: string;
}

const emailDesc = `You can sign in using this email address and use it
to reset your password.  You
will also receive email notifications about chats and other activity.   People
can add you as collaborators to projects by searching for your exact
email address. (There is no way to do a search for partial email
addresses, and your email address is never revealed to other users.)`;

const verificationDesc = `Your email is verified if we either sent you a verification email and you clicked on the link, or if you signed up using a registered single-sign-on provider (e.g., Google/Gmail or your university).`;

const EMAIL_ACCOUNT_Q = {
  accounts: { email_address: null, email_address_verified: null },
} as const;
interface Props {
  embedded?: boolean; // set to true if this is used elsewhere to set/change email address
  onSuccess?: () => void;
}

export function ChangeEmailAddress(props: Props) {
  const { embedded = false, onSuccess } = props;

  const { verifyEmailAddresses } = useCustomize();
  const hasPassword = useAPI("auth/has-password");

  const { loading, value, query } = useDatabase(EMAIL_ACCOUNT_Q);
  const [password, setPassword] = useState<string>("");
  const [lastSuccess, setLastSuccess] = useState<string>("");
  const [original, setOriginal] = useState<Data | undefined>(undefined);
  const [edited, setEdited] = useState<Data | undefined>(undefined);
  const [emailChanged, setEmailChanged] = useState<boolean>(false);

  useEffect(() => {
    if (!loading && original === undefined && value.accounts != null) {
      setOriginal(value.accounts);
      setEdited(value.accounts);
    }
  }, [loading]);

  useEffect(() => {
    if (edited == null) return;
    if (!edited.email_address) return;
    if (!lastSuccess) return;

    if (lastSuccess == password + edited.email_address) {
      setEmailChanged(true);
      query(EMAIL_ACCOUNT_Q);
      onSuccess?.();
    }
  }, [lastSuccess, edited?.email_address, password]);

  function onChange(field: string) {
    return (e) => setEdited({ ...edited, [field]: e.target.value });
  }

  if (original == null || edited == null || !hasPassword.result) {
    return <Loading />;
  }

  return (
    <div>
      <form>
        <Space
          size={"middle"}
          direction="vertical"
          style={{ width: "100%", maxWidth: "500px" }}
        >
          {!embedded && (
            <Paragraph>
              <Text strong>Your email address</Text> {emailDesc}
            </Paragraph>
          )}
          <Input
            addonBefore={"Email address"}
            defaultValue={original.email_address}
            onChange={onChange("email_address")}
          />
          <Input.Password
            addonBefore={
              hasPassword.result.hasPassword
                ? "Current password"
                : "Choose a password"
            }
            onChange={(e) => setPassword(e.target.value)}
          />
          <SaveButton
            disabled={
              password.length < MIN_PASSWORD_LENGTH ||
              !isValidEmailAddress(edited.email_address ?? "") ||
              lastSuccess == password + (edited.email_address ?? "")
            }
            edited={edited}
            original={original}
            setOriginal={setOriginal}
            onSave={async ({ email_address }) => {
              await apiPost("/accounts/set-email-address", {
                email_address,
                password,
              });
              setLastSuccess(password + email_address);
            }}
            isValid={() => password.length >= MIN_PASSWORD_LENGTH}
          />
          {lastSuccess == password + edited.email_address && (
            <Alert
              showIcon
              type="success"
              message={"Email address and password successfully saved."}
            />
          )}
          {!embedded && verifyEmailAddresses && (
            <EmailVerification
              loading={loading}
              emailChanged={emailChanged}
              account={value?.accounts}
            />
          )}
        </Space>
      </form>
    </div>
  );
}

interface VeryProps {
  loading?: boolean;
  emailChanged?: boolean; // if true, email has been changed and verification email has been sent already
  account?: {
    email_address?: string;
    email_address_verified?: { [key: string]: string /* an ISO date */ };
  };
}

const EmailVerification: React.FC<VeryProps> = (props: VeryProps) => {
  const { loading, account, emailChanged = false } = props;
  const [emailSent, setEmailSent] = useState<boolean>(false);
  const [emailSentSuccess, setEmailSentSuccess] = useState<boolean>(false);
  const [emailSentError, setEmailSentError] = useState<string | undefined>();

  const isVerified = useMemo((): Date | boolean => {
    if (account == null) return false;
    const { email_address, email_address_verified } = account;
    if (email_address == null) return false;
    const when = email_address_verified?.[email_address];
    if (when) {
      try {
        return new Date(when);
      } catch (err) {
        console.warn(
          `Error converting verified email time: ${when} – considering it as verified, though.`,
        );
        return true;
      }
    }
    return false;
  }, [account, loading]);

  async function sendVerificationEmail() {
    setEmailSent(true);
    try {
      apiPost("/accounts/send-verification-email", {});
      setEmailSentSuccess(true);
    } catch (err) {
      setEmailSentError(`${err}`);
    }
  }

  function renderStatus(status: boolean): JSX.Element {
    return (
      <Paragraph strong>
        Status:{" "}
        {status ? (
          <Text strong type="success">
            <Icon name="check" /> Verified
          </Text>
        ) : (
          <Text strong type="danger">
            <Icon name="times" /> Not Verified
          </Text>
        )}
      </Paragraph>
    );
  }

  function renderVerify() {
    if (loading) return <Loading />;
    if (isVerified) {
      return (
        <>
          {renderStatus(true)}
          <Paragraph>
            Your email address has been verified
            {isVerified instanceof Date && (
              <>
                {" "}
                <Timestamp datetime={isVerified} />
              </>
            )}
            .
          </Paragraph>
        </>
      );
    }
    if (account == null) return;
    const { email_address } = account;
    if (email_address == null) {
      return (
        <>
          {renderStatus(false)}
          <Paragraph>
            There is no email address to verify. Please set one above!
          </Paragraph>
        </>
      );
    }
    return (
      <>
        {renderStatus(false)}
        <Paragraph>
          To verify your email address, we sent you an email with a link to
          click on. You can also{" "}
          <Button
            disabled={emailChanged || emailSent}
            size="small"
            type="primary"
            onClick={sendVerificationEmail}
          >
            resend the verification email
          </Button>
          .
        </Paragraph>
        {(emailSentSuccess || emailChanged) && (
          <Alert
            type="success"
            message={
              <>
                <Icon name="mail" /> Verification email sent to{" "}
                <code>{email_address}</code>. Please check your inbox and click
                on the link in that email!
              </>
            }
          />
        )}
        {emailSentError && (
          <Alert
            type="error"
            message={
              <>
                <Icon name="times" /> Error sending verification email:{" "}
                <code>{emailSentError}</code>
              </>
            }
          />
        )}
      </>
    );
  }

  return (
    <>
      <br />
      <Title level={3}>Verified Email Address</Title>
      <Paragraph>{verificationDesc}</Paragraph>
      {/* <pre>{JSON.stringify(account, null, 2)}</pre> */}
      {renderVerify()}
    </>
  );
};

register({
  path: "account/email",
  title: "Email Address",
  icon: "paper-plane",
  desc: "Change your email address.",
  search: emailDesc,
  Component: ChangeEmailAddress,
});

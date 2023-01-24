/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Input, Space } from "antd";
import { useEffect, useState } from "react";

import { is_valid_email_address as isValidEmailAddress } from "@cocalc/util/misc";
import { Paragraph, Text } from "components/misc";
import SaveButton from "components/misc/save-button";
import Loading from "components/share/loading";
import apiPost from "lib/api/post";
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

interface Props {
  embedded?: boolean;
  onSuccess?: () => void;
}

export function ChangeEmailAddress(props: Props) {
  const { embedded = false, onSuccess } = props;

  const hasPassword = useAPI("auth/has-password");
  const { loading, value } = useDatabase({
    accounts: { email_address: null },
  });
  const [password, setPassword] = useState<string>("");
  const [lastSuccess, setLastSuccess] = useState<string>("");
  const [original, setOriginal] = useState<Data | undefined>(undefined);
  const [edited, setEdited] = useState<Data | undefined>(undefined);

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
              password.length < 6 ||
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
            isValid={() => password.length >= 6}
          />
          {lastSuccess == password + edited.email_address && (
            <Alert
              showIcon
              type="success"
              message={"Email address and password successfully saved."}
            />
          )}
        </Space>
      </form>
    </div>
  );
}

register({
  path: "account/email",
  title: "Email Address",
  icon: "paper-plane",
  desc: "Change your email address.",
  search: emailDesc,
  Component: ChangeEmailAddress,
});

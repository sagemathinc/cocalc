import { useEffect, useState } from "react";
import { Alert, Input, Space } from "antd";
import useDatabase from "lib/hooks/database";
import Loading from "components/share/loading";
import SaveButton from "components/misc/save-button";
import apiPost from "lib/api/post";
import register from "../register";
import useAPI from "lib/hooks/api";
import { is_valid_email_address as isValidEmailAddress } from "@cocalc/util/misc";

interface Data {
  email_address?: string;
}

const emailDesc = `You can sign in using this email address and use it
to reset your password.  You
will also receive email notifications about chats and other activity.   People
can add you as collaborators to projects by searching for your exact
email address. (There is no way to do a search for partial email
addresses, and your email address is never revealed to other users.)`;

register({
  path: "account/email",
  title: "Email Address",
  icon: "paper-plane",
  desc: "Change your email address.",
  search: emailDesc,
  Component: () => {
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
            direction="vertical"
            style={{ width: "100%", maxWidth: "500px" }}
          >
            <b>Your email address</b> {emailDesc}
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
  },
});

import { useEffect, useState } from "react";
import { Input, Space } from "antd";
import useDatabase from "lib/hooks/database";
import Loading from "components/share/loading";
import SaveButton from "components/misc/save-button";
import apiPost from "lib/api/post";

interface Data {
  email_address?: string;
}

export default function Email() {
  const { loading, value } = useDatabase({ accounts: { email_address: null } });
  const [password, setPassword] = useState<string>("");
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
  if (original == null || edited == null) {
    return <Loading />;
  }

  return (
    <div>
      <form>
        <Space
          direction="vertical"
          style={{ width: "100%", maxWidth: "500px" }}
        >
          <SaveButton
            edited={edited}
            defaultOriginal={original}
            onSave={async ({ email_address }) => {
              await apiPost("/accounts/set-email-address", {
                email_address,
                password,
              });
            }}
            isValid={() => password.length >= 6}
          />
          <br />
          <b>Your email address</b> If you set a password you can sign in using
          this email address and use this address to reset your password. You
          also receive email notifications about chats and other activity.
          <Input
            addonBefore={"Email address"}
            defaultValue={original.email_address}
            onChange={onChange("email_address")}
          />
          <Input.Password
            addonBefore={
              original.email_address ? "Current password" : "Choose a password"
            }
            onChange={(e) => setPassword(e.target.value)}
          />
        </Space>
      </form>
    </div>
  );
}

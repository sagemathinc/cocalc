import { Input, Space } from "antd";
import useDatabase from "lib/hooks/database";
import Loading from "components/share/loading";

export default function Email() {
  const db = useDatabase({ accounts: { email_address: null } });
  console.log("db = ", db);
  return (
    <div>
      <form>
        <Space
          direction="vertical"
          style={{ width: "100%", maxWidth: "500px" }}
        >
          <b>Your email address</b> If you set a password you can sign in using
          this email address and use this address to reset your password. You
          also receive email notifications about chats and being added to
          projects as a collaborator.
          {db.loading && <Loading style={{ fontSize: "12pt" }} />}
          {!db.loading && (
            <Input
              addonBefore={"Email address"}
              defaultValue={db.value.accounts?.email_address}
              onChange={(e) => {
                // TODO -- can't use database for this, since is a dangerous change.
                // We require user to type password and use special api call.
                const value = e.target.value;
                console.log(value);
              }}
            />
          )}
        </Space>
      </form>
    </div>
  );
}

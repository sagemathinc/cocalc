import { Input, Space } from "antd";

export default function Email() {
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
          <Input addonBefore={"Email address"} />
        </Space>
      </form>
    </div>
  );
}

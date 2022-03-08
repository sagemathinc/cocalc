import { useState } from "react";
import { Alert, Button, Input, Space } from "antd";
import register from "../register";
import A from "components/misc/A";
import Loading from "components/share/loading";
import apiPost from "lib/api/post";

register({
  path: "account/password",
  title: "Password",
  icon: "user-secret",
  desc: "Change or reset your password.",
  Component: () => {
    const [currentPassword, setCurrentPassword] = useState<string>("");
    const [newPassword, setNewPassword] = useState<string>("");
    const [changing, setChanging] = useState<boolean>(false);
    const [changed, setChanged] = useState<string>("");
    const [error, setError] = useState<string>("");

    async function resetPassword() {
      setError("");
      setChanging(true);
      setChanged("");
      try {
        await apiPost("/accounts/set-password", {
          currentPassword,
          newPassword,
        });
        setChanged(newPassword);
      } catch (err) {
        setError(err.message);
      } finally {
        setChanging(false);
      }
    }

    return (
      <Space direction="vertical">
        <h2>Change Password</h2>
        {error && (
          <Alert
            type="error"
            message={
              <>
                {error}{" "}
                <A href="/auth/password-reset">Reset password...</A>
              </>
            }
            showIcon
          />
        )}
        <b>Current password:</b>
        <Input.Password
          disabled={changing}
          placeholder="Current password..."
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        (leave blank if you have not set a password)
        <b>New password:</b>
        <Input.Password
          disabled={changing}
          placeholder="New password..."
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
          }}
          onPressEnter={resetPassword}
        />
        (at least 6 characters)
        <Button
          type="primary"
          disabled={
            (changed && changed == newPassword) ||
            changing ||
            newPassword.length < 6 ||
            newPassword == currentPassword
          }
          onClick={resetPassword}
        >
          {changing ? (
            <Loading delay={0}>Changing Password</Loading>
          ) : (
            "Change Password"
          )}
        </Button>
        {changed && changed == newPassword && (
          <Alert
            type="success"
            message={"Password successfully changed!"}
            showIcon
          />
        )}
        <br />
        <h2>Reset Password</h2>
        <div>
          You can also <A href="/auth/password-reset">reset your password</A>,
          in case you don't remember it.
        </div>
      </Space>
    );
  },
});

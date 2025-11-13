import { Alert } from "antd";

export default function AdminWarning() {
  return (
    <Alert
      showIcon
      type="error"
      style={{ margin: "15px 0" }}
      message={
        <strong>
          Warning: you are using this project as an administrator.
        </strong>
      }
      description={
        <>
          This is deprecated, dangerous, strongly discouraged, and probably
          broken. Use with caution. Usually it is better to impersonate a
          collaborator on this project. You can search for project ids on the
          admin page.
        </>
      }
    />
  );
}

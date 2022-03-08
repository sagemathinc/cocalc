/*
Show an error if something goes wrong trying to save
the account settings table to the database.
*/

import { Alert } from "antd";
import { useTypedRedux } from "../app-framework";

export default function AccountTableError() {
  const tableError = useTypedRedux("account", "tableError");
  if (!tableError) return null;

  const { error, query } = tableError.toJS();

  let obj;
  try {
    // this should work.
    obj = query[0]["accounts"];
    delete query["account_id"];
  } catch (_err) {
    obj = query;
  }

  let description;
  if (obj["name"] != null) {
    // Issue trying to set the username.
    description =
      "Please try a different username.  Names can be between 1 and 39 characters, contain upper and lower case letters, numbers, and dashes.";
  } else {
    description = (
      <>
        There was an error trying to save an account setting to the server. In
        particular, the following change failed:
        <pre style={{ margin: "30px" }}>
          {JSON.stringify(obj, undefined, 2)}
        </pre>
        Try changing the relevant field below.
      </>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      <Alert
        style={{ margin: "15px auto", maxWidth: "900px" }}
        message={<b>{error}</b>}
        description={description}
        type="error"
      />
    </div>
  );
}

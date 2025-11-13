/*
Show an error if something goes wrong trying to save
the account settings table to the database.
*/

import ShowError from "@cocalc/frontend/components/error";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";

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
  if (obj?.["name"] != null) {
    // Issue trying to set the username.
    description =
      "Please try a different username.  Names can be between 1 and 39 characters, contain upper and lower case letters, numbers, and dashes.";
  } else {
    description = `
There was an error trying to save an account setting to the server. In
particular, the following change failed:

\`\`\`js
${JSON.stringify(obj, undefined, 2)}
\`\`\`
`;
  }

  return (
    <div style={{ width: "100%" }}>
      <ShowError
        error={`${error}\n\n${description}`}
        setError={() =>
          redux.getActions("account").setState({ tableError: undefined })
        }
        style={{ margin: "15px auto", maxWidth: "900px" }}
      />
    </div>
  );
}

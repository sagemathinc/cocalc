/* Show an error if there is a problem saving project settings to the server. */
import { Alert } from "antd";
import { redux, useRedux } from "@cocalc/frontend/app-framework";

interface Props {
  project_id: string;
}

export default function SavingProjectSettingsError({ project_id }: Props) {
  const tableError = useRedux(["projects", "tableError"]);
  if (!tableError) return null;
  const { error, query } = tableError.toJS();
  let obj;
  try {
    // this should work.
    obj = query[0]["projects"];
  } catch (_err) {
    obj = query;
  }

  let description;
  if (obj["project_id"]?.length == 36 && obj["project_id"] != project_id) {
    // A problem saving for one project will break saving for everybody, so better inform user about this.
    // Yes, this is dumb/lazy/annoying.
    const title = redux.getStore("projects").get_title(obj["project_id"]);
    description = `There is a problem saving settings for the project "${title}".  Please open that project and fix the problem.`;
  } else {
    if (obj["name"] != null) {
      // Issue trying to set the project name.
      description =
        "Please try a different project name.  Names can be between 1 and 100 characters, contain upper and lower case letters, numbers, dashes and periods, and must be unique across all projects that you own.  Only the owner of a project can currently change the name.";
    } else {
      description = (
        <>
          There was an error trying to save a project setting to the server. In
          particular, the following change failed:
          <pre style={{ margin: "30px" }}>
            {JSON.stringify(obj, undefined, 2)}
          </pre>
          Try modifying the relevant field below.
        </>
      );
    }
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

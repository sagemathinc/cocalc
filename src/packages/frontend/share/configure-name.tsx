/* Setting the name of a public share. */

import { useState } from "react";

import { Alert, Button, Input } from "antd";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { client_db } from "@cocalc/util/schema";

interface Props {
  project_id: string;
  path: string;
}

export default function ConfigureName({ project_id, path }: Props) {
  const public_paths = useTypedRedux({ project_id }, "public_paths");
  const id = client_db.sha1(project_id, path);

  console.log({ id, public_paths: public_paths?.toJS() });
  const name: string | undefined = public_paths?.getIn([id, "name"]);
  const [choosingName, setChoosingName] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  async function save(e) {
    try {
      setSaving(true);
      setError("");
      const name = e.target.value;
      await redux.getProjectActions(project_id).setPublicPathName(path, name);
      setSaved(true);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ margin: "15px 0" }}>
      <h4>Name{name ? `: ${name}` : ""}</h4>
      <span>
        {name
          ? "This name will be used to provid a nicer URL."
          : "Name this public path so that it has a much nicer memorable URL."}
      </span>
      {!name && !choosingName ? (
        <Button
          style={{ marginLeft: "15px" }}
          onClick={() => setChoosingName(true)}
        >
          Choose a name...
        </Button>
      ) : (
        <span>
          {" "}
          Edit the name below; it can be up to 100 letters, digits, dashes
          and periods, and must be unique in this project. (TEMPORARY WARNING:
          If you change the name, existing public shared links using the
          previous name will break, so change with caution.) For optimal URLs,
          also set the project name in project settings and the project owner
          username in account preferences.
          <Input
            onPressEnter={save}
            onBlur={save}
            onChange={(e) => {
              if (e.target.value != name) {
                setSaved(false);
              }
            }}
            defaultValue={name}
            readOnly={saving}
            style={{ margin: "15px 0" }}
          />
          {saving ? "Saving..." : ""}
          {saved ? "Saved" : ""}
          {error && (
            <Alert style={{ margin: "15px 0" }} type="error" message={error} />
          )}
        </span>
      )}
    </div>
  );
}

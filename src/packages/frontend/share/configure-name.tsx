/* Setting the name of a public share. */

import { Alert, Button, Input, Space } from "antd";
import { useEffect, useState } from "react";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Paragraph, Title } from "@cocalc/frontend/components";
import { Icon } from "@cocalc/frontend/components/icon";
import { client_db } from "@cocalc/util/schema";

interface Props {
  project_id: string;
  path: string;
  saveRedirect: (string) => void;
  disabled?: boolean;
}

export function ConfigureName({
  project_id,
  path,
  saveRedirect,
  disabled,
}: Props) {
  const public_paths = useTypedRedux({ project_id }, "public_paths");
  const id = client_db.sha1(project_id, path);

  const [name, setName] = useState<string>(
    (public_paths?.getIn([id, "name"]) ?? "") as any,
  );
  const [redirect, setRedirect] = useState<string>(
    (public_paths?.getIn([id, "redirect"]) ?? "") as any,
  );
  const [choosingName, setChoosingName] = useState<boolean>(!!name);
  const [choosingRedirect, setChoosingRedirect] = useState<boolean>(!!redirect);
  const [saving, setSaving] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const name = (public_paths?.getIn([id, "name"]) ?? "") as string;
    const redirect = (public_paths?.getIn([id, "redirect"]) ?? "") as string;
    setName(name);
    setChoosingName(!!name);
    setRedirect(redirect);
    setChoosingRedirect(!!redirect);
  }, [id]);

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

  // if user presses the Esc key, we set choosingName to false and don't save
  async function keyup(e) {
    if (e.key === "Escape") {
      setChoosingName(false);
    }
  }

  return (
    <Space direction="vertical">
      <div>
        <Title level={4}>
          <Icon name="global" /> Name{name ? `: ${name}` : " - optional"}
        </Title>
        <Paragraph type="secondary">
          {name
            ? "This name will be used to provide a nicer URL. "
            : "Name this public path so that it has a memorable URL. "}
        </Paragraph>
        {!name && !choosingName ? (
          <Button onClick={() => setChoosingName(true)}>
            Choose a name...
          </Button>
        ) : (
          <div>
            <Space.Compact style={{ width: "100%" }}>
              <Input
                allowClear
                disabled={disabled}
                onPressEnter={save}
                onKeyUp={keyup}
                onBlur={save}
                onChange={(e) => {
                  if (e.target.value != name) {
                    setSaved(false);
                  }
                  setName(e.target.value);
                }}
                value={name}
                readOnly={saving}
              />
              <Button
                disabled={
                  saving ||
                  disabled ||
                  public_paths?.getIn([id, "name"], "") == name
                }
                onClick={save}
              >
                Save
              </Button>
            </Space.Compact>
            {saving ? "Saving... " : ""}
            {saved ? "Saved. " : ""}
            {error && (
              <Alert
                style={{ margin: "15px 0" }}
                type="error"
                message={error}
              />
            )}
            {(name || choosingName) && (
              <Paragraph type="secondary">
                Edit the name of this shared path. The name can be up to 100
                letters, digits, dashes and periods, and must be unique in this
                workspace. For a nice URL, also set both the workspace name in
                Workspace Settings <b>and</b> the workspace owner's name in
                Account Preferences. (WARNING: If you change the name, existing
                public shared links using the previous name will break, so
                change with caution. Instead, create a new shared document and
                define a redirect below.)
              </Paragraph>
            )}
          </div>
        )}
      </div>
      <div>
        <Title level={4}>
          <Icon name="retweet" /> Redirect
        </Title>
        <div>
          {!redirect && !choosingRedirect ? (
            <Button onClick={() => setChoosingRedirect(true)}>
              Set redirect URL...
            </Button>
          ) : (
            <Space.Compact style={{ width: "100%" }}>
              <Input
                allowClear
                disabled={disabled}
                onChange={(e) => {
                  setRedirect(e.target.value);
                }}
                value={redirect}
                readOnly={saving}
                onBlur={() => {
                  saveRedirect(redirect);
                }}
                onKeyUp={(e) => {
                  if (e.key === "Escape") {
                    setChoosingRedirect(false);
                  }
                }}
              />
              <Button
                disabled={
                  disabled || public_paths?.getIn([id, "redirect"]) == redirect
                }
                onClick={() => {
                  saveRedirect(redirect);
                }}
              >
                Save
              </Button>
            </Space.Compact>
          )}
          {(redirect || choosingRedirect) && (
            <Paragraph type="secondary">
              If you move this content somewhere else, put the full URL here and
              when people visit this share, they will be redirected there. If
              the URL is to another publicly shared path then it will be
              automatic; if it is to an external site, the user will see a
              message with a link.
            </Paragraph>
          )}
        </div>
      </div>
    </Space>
  );
}

/*
Configuration copying.

- List one or more other course files (TODO: also support other projects that you have access to).
- Select which configuration to share (and parameters)
- Click a button to copy the configuration from this course 
  to the target courses.
*/

import { Alert, Button, Card, Checkbox, Input, Space, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { useEffect, useState } from "react";
import { pathExists } from "@cocalc/frontend/project/directory-selector";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
interface Props {
  settings;
  project_id;
  actions;
}

export default function ConfigurationCopying({
  settings,
  project_id,
  actions,
}: Props) {
  const checked = !!settings.get("mirror_config");
  const setChecked = (mirror_config: boolean) => {
    actions.set({ mirror_config, table: "settings" });
  };
  const path = settings.get("mirror_config_path") ?? "";
  const [path0, setPath0] = useState<string>(path);
  const setPath = (mirror_config_path) => {
    actions.set({ mirror_config_path, table: "settings" });
  };
  const [exists, setExists] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const directoryListings = useTypedRedux(
    { project_id },
    "directory_listings",
  )?.get(0);

  const save = async () => {
    setPath(path0);
  };

  const updateExists = async (path) => {
    setLoading(true);
    try {
      if (!path) {
        setExists(null);
        return;
      }
      try {
        const exists = await pathExists(project_id, path, directoryListings);
        setExists(exists);
      } catch (_err) {
        console.warn("checking for path -- ", _err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    updateExists(path);
  }, [path]);

  return (
    <Card
      title={
        <>
          <Icon name="envelope" /> Configuration Copying
        </>
      }
    >
      <div style={{ width: "100%" }}>
        <Checkbox
          checked={checked}
          onChange={(e) => setChecked((e.target as any).checked)}
        >
          Copying Configuration to Other Courses
        </Checkbox>
      </div>
      {checked && (
        <>
          <Space.Compact block style={{ marginTop: "15px", width: "100%" }}>
            <Input
              style={{ width: "100%" }}
              allowClear
              placeholder="Path to master .course file relative to HOME directory..."
              onChange={(e) => setPath0(e.target.value)}
              value={path0}
              onPressEnter={save}
            />
            <Button
              type="primary"
              onClick={save}
              disabled={
                loading ||
                path0 == path ||
                !(path0.endsWith(".course") || !path0)
              }
            >
              <Icon name="save" /> Save
              {loading && <Spin style={{ marginLeft: "5px" }} />}
            </Button>
          </Space.Compact>
          {exists === true && path && (
            <Alert
              style={{ marginTop: "15px" }}
              showIcon
              type="success"
              message={
                <>
                  <a
                    onClick={() => {
                      redux.getProjectActions(project_id).open_file({ path });
                    }}
                  >
                    {path}
                  </a>{" "}
                  exists
                </>
              }
            />
          )}
          {exists === false && path && (
            <Alert
              style={{ marginTop: "15px" }}
              type="warning"
              showIcon
              message={
                <>
                  WARNING:{" "}
                  <a
                    onClick={() => {
                      redux.getProjectActions(project_id).open_file({ path });
                      // above creates the file
                      setExists(true);
                    }}
                  >
                    {path}
                  </a>{" "}
                  does not exist
                </>
              }
            />
          )}
          <hr />
          <span style={{ color: "#666" }}>
            If this box is checked and you fill in the filename of another
            course (in this project), then when you make configuration changes
            to <i>this course</i>, they can be easily copied to this other
            course. The configuration parameters that are mirrored are:
            <ul>
              <li>Payment and licensing configuration</li>
              <li>Email Invitation -- the email invitation template</li>
              <li>Restrict Student Projects -- the state of the checkboxes</li>
            </ul>
            The title and description of the course are not mirrored.
            Configuration mirroring is useful if you have a large course broken
            into small sections. Make one "master" course file with no students,
            then mirror its configuration to all of the sections. You only have
            to setup payment, email invites, and other configuration once, and
            it gets inherited by all of the sections. NOTE: currently you have
            to have the mirrored course files open for changes to take effect.
          </span>
        </>
      )}
    </Card>
  );
}

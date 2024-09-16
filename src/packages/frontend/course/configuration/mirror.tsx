import { Button, Card, Checkbox, Input, Space } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { useState } from "react";

interface Props {
  checked?: boolean;
  setChecked: (checked: boolean) => void;
  path?: string;
  setPath: (path: string) => void;
}

export default function Mirror({ checked, setChecked, path, setPath }: Props) {
  const [path0, setPath0] = useState<string>(path ?? "");

  const save = async () => {
    setPath(path0);
  };

  return (
    <Card
      title={
        <>
          <Icon name="envelope" /> Configuration Mirroring
        </>
      }
    >
      <div style={{ width: "100%" }}>
        <Checkbox
          checked={checked}
          onChange={(e) => setChecked((e.target as any).checked)}
        >
          Mirror Configuration From Another Course
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
              disabled={path0 == path || !(path0.endsWith(".course") || !path0)}
            >
              <Icon name="save" /> Save
            </Button>
          </Space.Compact>
          <hr />
          <span style={{ color: "#666" }}>
            If this box is checked and you fill in the filename of another
            course (in this project), then any time you make configuration
            changes to <i>that course</i>, those changes will automatically be
            reflected in this course (assuming this course file is opened). The
            configuration parameters that are mirrored are:
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

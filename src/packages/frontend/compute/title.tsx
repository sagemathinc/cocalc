import { Button, Input, Space, Spin, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { setServerTitle } from "./api";

const NO_TITLE = "No Title";

interface Props {
  title?: string;
  id?: number;
  editable?: boolean;
  setError?;
}

export default function Title({ title, id, editable, setError }: Props) {
  const [saving, setSaving] = useState<boolean>(false);
  const [edit, setEdit] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>(
    title?.trim() ? title : NO_TITLE,
  );
  useEffect(() => {
    setNewTitle(title?.trim() ? title : NO_TITLE);
  }, [title]);

  if (!editable || !id) {
    return <>{newTitle}</>;
  }

  const handleSave = async () => {
    if (edit) {
      if (newTitle == title) return;
      // save to backend
      try {
        setSaving(true);
        await setServerTitle({ title: newTitle, id });
      } catch (err) {
        setError(`${err}`);
      } finally {
        setSaving(false);
      }
    }
    setEdit(!edit);
  };

  return (
    <Space>
      {edit ? null : (
        <div style={{ cursor: "pointer" }} onClick={() => setEdit(true)}>
          {newTitle}
        </div>
      )}
      {edit && (
        <Input
          style={{ width: "300px" }}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onPressEnter={handleSave}
        />
      )}
      {edit && (
        <>
          <Button
            style={{ marginRight: "5px" }}
            onClick={() => {
              setNewTitle(title ? title : NO_TITLE);
              setEdit(false);
            }}
          >
            Cancel
          </Button>
          <Tooltip title="Edit the compute server's title.  The title is purely cosmetic, and you can change it whenever you want.">
            <Button
              type={"primary"}
              disabled={saving || title == newTitle}
              onClick={handleSave}
            >
              Save
              {saving && <Spin />}
            </Button>
          </Tooltip>
        </>
      )}
    </Space>
  );
}

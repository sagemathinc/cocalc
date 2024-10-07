import { Alert, Button, Card, Checkbox, Input, Space, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import {
  filename_extension,
  path_split,
  path_to_file,
} from "@cocalc/util/misc";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { useRedux } from "@cocalc/frontend/app-framework";
import CheckedFiles from "./checked-files";
import { Icon } from "@cocalc/frontend/components/icon";
import ShowError from "@cocalc/frontend/components/error";

interface Props {
  duplicate?: boolean;
}

export default function RenameFile({ duplicate }: Props) {
  const inputRef = useRef<any>(null);
  const { actions } = useProjectContext();
  const checked_files = useRedux(["checked_files"], actions?.project_id ?? "");
  const [target, setTarget] = useState<string>(() => {
    return path_split(checked_files?.first() ?? "").tail;
  });
  const ext = filename_extension(target);
  const [editExtension, setEditExtension] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.select();
    }, 1);
  }, []);

  useEffect(() => {
    setTarget(path_split(checked_files?.first() ?? "").tail);
  }, [checked_files]);

  const doRename = async () => {
    setError("");
    if (loading || actions == null) {
      return;
    }
    const store = actions.get_store();
    if (store == null) {
      return;
    }
    const src = checked_files?.first();
    if (src == null) {
      return;
    }
    const renameDir = path_split(src).head;
    try {
      setLoading(true);
      await actions.rename_file({
        src: checked_files.first(),
        dest: path_to_file(renameDir, target),
      });
      await actions.fetch_directory_listing({ path: renameDir });
    } catch (err) {
      setLoading(false);
      setError(err);
    } finally {
      setLoading(false);
    }
    actions.set_all_files_unchecked();
    actions.set_file_action();
  };

  if (actions == null) {
    return null;
  }

  return (
    <Card
      title=<>
        <Icon name="swap" /> Rename the file '{checked_files?.first()}'
      </>
    >
      <CheckedFiles />
      <Space style={{ marginTop: "15px" }} wrap>
        New Name
        {editExtension ? (
          <Input
            ref={inputRef}
            autoFocus
            onChange={(e) => setTarget(e.target.value)}
            type="text"
            value={target}
            placeholder="New Name"
            onPressEnter={doRename}
          />
        ) : (
          <Input
            ref={inputRef}
            autoFocus
            onChange={(e) => setTarget(e.target.value + "." + ext)}
            type="text"
            value={target.slice(0, -ext.length - 1)}
            placeholder="New Name"
            onPressEnter={doRename}
            suffix={"." + ext}
          />
        )}
        <div style={{ marginLeft: "5px" }} />
        <Button
          onClick={() => {
            actions?.set_file_action();
          }}
        >
          Cancel
        </Button>{" "}
        <Button
          onClick={doRename}
          type="primary"
          disabled={
            loading || target == path_split(checked_files?.first() ?? "").tail
          }
        >
          Rename File {loading && <Spin />}
        </Button>
      </Space>
      <div style={{ marginTop: "15px" }} />
      <Checkbox
        checked={editExtension}
        onChange={() => setEditExtension(!editExtension)}
      >
        Edit Filename Extension
      </Checkbox>
      {editExtension && (
        <Alert
          style={{ marginTop: "15px" }}
          type="warning"
          message={
            "Editing the filename extension may cause your file to no longer open properly."
          }
          showIcon
        />
      )}
      <ShowError setError={setError} error={error} />
    </Card>
  );
}

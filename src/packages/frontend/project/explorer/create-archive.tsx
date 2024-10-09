import { Button, Card, Input, Space, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import { path_split, path_to_file, plural } from "@cocalc/util/misc";
import { default_filename } from "@cocalc/frontend/account";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { useRedux } from "@cocalc/frontend/app-framework";
import CheckedFiles from "./checked-files";
import ShowError from "@cocalc/frontend/components/error";

export default function CreateArchive({}) {
  const inputRef = useRef<any>(null);
  const { actions } = useProjectContext();
  const checked_files = useRedux(["checked_files"], actions?.project_id ?? "");
  const [target, setTarget] = useState<string>(() => {
    if (checked_files?.size == 1) {
      return path_split(checked_files?.first()).tail;
    }
    return default_filename("", actions?.project_id ?? "");
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.select();
    }, 1);
  }, []);

  const doCompress = async () => {
    if (actions == null) {
      return;
    }
    const store = actions.get_store();
    if (store == null) {
      return;
    }
    try {
      setLoading(true);
      await actions.zip_files({
        src: checked_files.toArray(),
        dest: path_to_file(store.get("current_path"), target + ".zip"),
      });
      await actions.fetch_directory_listing({
        path: store.get("current_path"),
      });
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
        Create a zip file from the following {checked_files?.size} selected{" "}
        {plural(checked_files?.size, "item")}
      </>
    >
      <CheckedFiles />
      <Space style={{ marginTop: "15px" }} wrap>
        <Input
          ref={inputRef}
          autoFocus
          onChange={(e) => setTarget(e.target.value)}
          value={target}
          placeholder="Name of zip archive..."
          onPressEnter={doCompress}
          suffix=".zip"
        />
        <div style={{ marginLeft: "5px" }} />
        <Button
          onClick={() => {
            actions?.set_file_action();
          }}
        >
          Cancel
        </Button>{" "}
        <Button onClick={doCompress} type="primary" disabled={loading}>
          Compress {checked_files?.size} {plural(checked_files?.size, "item")}{" "}
          {loading && <Spin />}
        </Button>
      </Space>
      <ShowError setError={setError} error={error} />
    </Card>
  );
}

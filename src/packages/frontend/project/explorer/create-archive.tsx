import { Input, Space } from "antd";
import { useEffect, useRef, useState } from "react";

import { default_filename } from "@cocalc/frontend/account";
import { useRedux } from "@cocalc/frontend/app-framework";
import ShowError from "@cocalc/frontend/components/error";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { path_split } from "@cocalc/util/misc";
import CheckedFiles from "./checked-files";

export default function CreateArchive({
  formId,
  onActionChange,
}: {
  formId?: string;
  onActionChange?: (loading: boolean) => void;
}) {
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
    if (actions == null || loading) {
      return;
    }
    const store = actions.get_store();
    if (store == null) {
      return;
    }
    try {
      setLoading(true);
      onActionChange?.(true);
      const files = checked_files.toArray();
      const path = store.get("current_path");
      await actions.zip_files({
        src: path ? files.map((x: string) => x.slice(path.length + 1)) : files,
        dest: target + ".zip",
        path,
      });
      await actions.fetch_directory_listing({ path });
      actions.set_all_files_unchecked();
      actions.set_file_action();
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
      onActionChange?.(false);
    }
  };

  if (actions == null) {
    return null;
  }

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        doCompress();
      }}
    >
      <CheckedFiles />
      <Space style={{ marginTop: "15px" }} wrap>
        <Input
          ref={inputRef}
          autoFocus
          onChange={(e) => setTarget(e.target.value)}
          value={target}
          placeholder="Name of zip archive..."
          suffix=".zip"
        />
      </Space>
      <ShowError setError={setError} error={error} />
    </form>
  );
}

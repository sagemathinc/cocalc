import { Alert, Input, Space, Switch } from "antd";
import { useEffect, useRef, useState } from "react";

import { useRedux } from "@cocalc/frontend/app-framework";
import ShowError from "@cocalc/frontend/components/error";
import { useProjectContext } from "@cocalc/frontend/project/context";
import {
  filename_extension,
  path_split,
  path_to_file,
  tab_to_path,
} from "@cocalc/util/misc";
import CheckedFiles from "./checked-files";

const MAX_FILENAME_LENGTH = 4095;

interface Props {
  duplicate?: boolean;
  formId?: string;
}

export default function RenameFile({ duplicate, formId }: Props) {
  const inputRef = useRef<any>(null);
  const { actions } = useProjectContext();
  const checked_files = useRedux(["checked_files"], actions?.project_id ?? "");
  const [target, setTarget] = useState<string>("");
  const ext = filename_extension(target);
  const [editExtension, setEditExtension] = useState<boolean>(!ext);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const resolvedFormId = formId ?? "file-action-rename-form";

  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.select();
    }, 1);
  }, []);

  useEffect(() => {
    const name = path_split(checked_files?.first() ?? "").tail;
    let target;
    if (duplicate) {
      target =
        actions?.suggestDuplicateFilenameInCurrentDirectory(name) ?? name;
    } else {
      target = name;
    }
    setEditExtension(!filename_extension(target));
    setTarget(target);
  }, [checked_files, duplicate]);

  const doAction = async () => {
    setError("");
    if (loading || actions == null || !target) {
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
    if (target == path_split(src).tail) {
      return;
    }
    const actionSource = store.get("file_action_source");
    const wasOpen = !!store.get("open_files")?.has(src);
    const wasActive = tab_to_path(store.get("active_project_tab")) === src;
    const renameDir = path_split(src).head;
    try {
      setLoading(true);
      const opts = {
        src: checked_files.first(),
        dest: path_to_file(renameDir, target),
      };
      if (duplicate) {
        await actions.copy_paths({
          src: [opts.src],
          dest: opts.dest,
          only_contents: true,
        });
        if (actionSource === "editor") {
          await actions.open_file({
            path: opts.dest,
            foreground: true,
            foreground_project: true,
          });
        }
      } else {
        await actions.rename_file(opts);
        if (wasOpen) {
          actions.close_tab(src);
          await actions.open_file({
            path: opts.dest,
            foreground: wasActive,
            foreground_project: true,
          });
        }
      }
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
    <form
      id={resolvedFormId}
      onSubmit={(e) => {
        e.preventDefault();
        void doAction();
      }}
    >
      <CheckedFiles />
      <Space style={{ marginTop: "15px" }} wrap>
        New Name
        {editExtension ? (
          <Input
            maxLength={MAX_FILENAME_LENGTH}
            ref={inputRef}
            autoFocus
            onChange={(e) => setTarget(e.target.value)}
            type="text"
            value={target}
            placeholder="New Name"
            onPressEnter={() => void doAction()}
          />
        ) : (
          <Input
            maxLength={MAX_FILENAME_LENGTH - ext.length - 1}
            ref={inputRef}
            autoFocus
            onChange={(e) => setTarget(e.target.value + "." + ext)}
            type="text"
            value={target.slice(0, -ext.length - 1)}
            placeholder="New Name"
            onPressEnter={() => void doAction()}
            suffix={"." + ext}
          />
        )}
      </Space>
      {!duplicate && (
        <div
          style={{
            marginTop: "12px",
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <Switch
            disabled={!ext}
            checked={editExtension}
            onChange={(value) => setEditExtension(value)}
          />
          <span>Edit Filename Extension</span>
        </div>
      )}
      {!duplicate && <div style={{ marginTop: "15px" }} />}
      {editExtension &&
        filename_extension(checked_files?.first() ?? "") != ext && (
          <Alert
            style={{ marginTop: "15px" }}
            type="warning"
            message={
              "Changing the filename extension may cause your file to no longer open properly."
            }
            showIcon
          />
        )}
      {target.length > MAX_FILENAME_LENGTH && (
        <Alert
          style={{ marginTop: "15px" }}
          showIcon
          type="error"
          message={`The maximum length of a filename is ${MAX_FILENAME_LENGTH}.`}
        />
      )}
      <ShowError setError={setError} error={error} />
    </form>
  );
}

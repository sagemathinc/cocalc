import { Button, Card, Input, Space, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";

import { default_filename } from "@cocalc/frontend/account";
import { redux, useRedux } from "@cocalc/frontend/app-framework";
import CopyToClipBoard from "@cocalc/frontend/components/copy-to-clipboard";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import { labels } from "@cocalc/frontend/i18n";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { path_split, path_to_file, plural } from "@cocalc/util/misc";
import CheckedFiles from "./checked-files";

export default function Download({
  modal,
  formId,
  onActionChange,
}: {
  modal?: boolean;
  formId?: string;
  onActionChange?: (loading: boolean) => void;
}) {
  const intl = useIntl();
  const inputRef = useRef<any>(null);
  const { actions } = useProjectContext();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const project_id = actions?.project_id ?? "";
  const current_path = useRedux(["current_path"], project_id);
  const checked_files = useRedux(["checked_files"], project_id);
  const [target, setTarget] = useState<string>(() => {
    if (checked_files?.size == 1) {
      return path_split(checked_files?.first()).tail;
    }
    return default_filename("", actions?.project_id ?? "");
  });
  const [url, setUrl] = useState<string>("todo");
  const [archiveMode, setArchiveMode] = useState<boolean>(
    (checked_files?.size ?? 0) > 1,
  );

  useEffect(() => {
    if (checked_files == null) {
      return;
    }
    if (checked_files.size > 1) {
      setArchiveMode(true);
      return;
    }
    const file = checked_files.first();
    const isdir = redux.getProjectStore(project_id).get("displayed_listing")
      ?.file_map?.[path_split(file).tail]?.isdir;
    setArchiveMode(!!isdir);
    if (!isdir) {
      const store = actions?.get_store();
      const path = store?.fileURL(file) ?? "";
      setUrl(path ? `${document.location.origin}${path}` : "");
    }
  }, [checked_files, current_path]);

  useEffect(() => {
    if (!archiveMode) {
      return;
    }
    if (checked_files?.size == 1) {
      setTarget(path_split(checked_files?.first()).tail);
    } else {
      setTarget(default_filename("", actions?.project_id ?? ""));
    }

    setTimeout(() => {
      inputRef.current?.select();
    }, 1);
  }, [archiveMode]);

  const doDownload = async () => {
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
      let dest;
      if (archiveMode) {
        const path = store.get("current_path");
        dest = path_to_file(path, target + ".zip");
        await actions.zip_files({
          src: path ? files.map((x) => x.slice(path.length + 1)) : files,
          dest: target + ".zip",
          path: store.get("current_path"),
        });
      } else {
        dest = files[0];
      }
      actions.download_file({ path: dest, log: files });
      await actions.fetch_directory_listing({
        path: store.get("current_path"),
      });
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

  const content = (
    <>
      <CheckedFiles />
      {archiveMode && (
        <Input
          ref={inputRef}
          autoFocus
          onChange={(e) => setTarget(e.target.value)}
          value={target}
          placeholder="Name of zip archive..."
          onPressEnter={modal ? undefined : doDownload}
          suffix=".zip"
          style={{ marginBottom: 10 }}
        />
      )}
      {!archiveMode && (
        <CopyToClipBoard
          label="Raw link"
          value={url}
          inputWidth="100%"
          outerStyle={{ width: "100%" }}
          style={{ marginBottom: 10 }}
          inputStyle={{ fontFamily: "monospace", fontSize: 12 }}
        />
      )}
      <ShowError setError={setError} error={error} />
    </>
  );

  if (modal) {
    return (
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          doDownload();
        }}
      >
        {content}
      </form>
    );
  }

  return (
    <Card
      title={<>Download {archiveMode ? "files" : "a file"} to your computer</>}
    >
      {content}
      <div
        style={{
          marginTop: "15px",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Space wrap>
          <Button
            onClick={() => {
              actions?.set_file_action();
            }}
          >
            {intl.formatMessage(labels.cancel)}
          </Button>
          <Button onClick={doDownload} type="primary" disabled={loading}>
            <Icon name="cloud-download" />{" "}
            {archiveMode
              ? `Compress ${checked_files?.size} ${plural(checked_files?.size, "item")} and Download ${target}.zip`
              : "Download"}{" "}
            {loading && <Spin />}
          </Button>
        </Space>
      </div>
    </Card>
  );
}

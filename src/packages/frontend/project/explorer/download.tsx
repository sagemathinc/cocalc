import { Button, Card, Input, Space, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";

import { default_filename } from "@cocalc/frontend/account";
import { useRedux } from "@cocalc/frontend/app-framework";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import { labels } from "@cocalc/frontend/i18n";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { path_split, path_to_file, plural } from "@cocalc/util/misc";
import { PRE_STYLE } from "./action-box";
import CheckedFiles from "./checked-files";

export default function Download() {
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
    if (actions == null) {
      return;
    }
    if (checked_files == null) {
      return;
    }
    if (checked_files.size > 1) {
      setArchiveMode(true);
      return;
    }
    const file = checked_files.first();
    const isDir = !!actions.isDirViaCache(file);
    setArchiveMode(!!isDir);
    if (!isDir) {
      const store = actions?.get_store();
      setUrl(store?.fileURL(file) ?? "");
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
    } catch (err) {
      console.log(err);
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
      title=<>Download {archiveMode ? "files" : "a file"} to your computer</>
    >
      <div style={{ display: "flex" }}>
        <div style={{ flex: 1, overflowX: "auto", marginRight: "15px" }}>
          <CheckedFiles />
        </div>
        {archiveMode && (
          <div style={{ flex: 1 }}>
            <Input
              ref={inputRef}
              autoFocus
              onChange={(e) => setTarget(e.target.value)}
              value={target}
              placeholder="Name of zip archive..."
              onPressEnter={doDownload}
              suffix=".zip"
            />
          </div>
        )}
        {!archiveMode && (
          <div
            style={{
              flex: 1,
              overflowX: "auto",
              display: "flex",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                height: PRE_STYLE.minHeight,
                marginRight: "15px",
              }}
            >
              <a href={url} target="_blank">
                <Icon name="external-link" />
              </a>
            </div>
            <pre style={{ ...PRE_STYLE, height: PRE_STYLE.minHeight }}>
              <a href={url} target="_blank">
                {url}
              </a>
            </pre>
          </div>
        )}
      </div>
      {archiveMode && (
        <Space wrap>
          <Button
            onClick={() => {
              actions?.set_file_action();
            }}
          >
            {intl.formatMessage(labels.cancel)}
          </Button>{" "}
          <Button onClick={doDownload} type="primary" disabled={loading}>
            <Icon name="cloud-download" /> Compress {checked_files?.size}{" "}
            {plural(checked_files?.size, "item")} and Download {target}.zip{" "}
            {loading && <Spin />}
          </Button>
        </Space>
      )}
      {!archiveMode && (
        <Space wrap>
          <Button
            onClick={() => {
              actions?.set_file_action();
            }}
          >
            {intl.formatMessage(labels.cancel)}
          </Button>{" "}
          <Button onClick={doDownload} type="primary" disabled={loading}>
            <Icon name="cloud-download" /> Download {loading && <Spin />}
          </Button>
        </Space>
      )}
      <ShowError setError={setError} error={error} />
    </Card>
  );
}

import { Button, Card, Input, Space, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { default_filename } from "@cocalc/frontend/account";
import { useRedux } from "@cocalc/frontend/app-framework";
import ShowError from "@cocalc/frontend/components/error";
import { labels } from "@cocalc/frontend/i18n";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { path_split, plural } from "@cocalc/util/misc";
import CheckedFiles from "./checked-files";

export default function CreateArchive({}) {
  const intl = useIntl();
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
      const files = checked_files.toArray();
      const path = store.get("current_path");
      await actions.zip_files({
        src: path ? files.map((x) => x.slice(path.length + 1)) : files,
        dest: target + ".zip",
        path,
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
          {intl.formatMessage(labels.cancel)}
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

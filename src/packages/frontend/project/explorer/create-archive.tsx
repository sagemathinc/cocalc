import { Button, Card, Input, Space } from "antd";
import { useEffect, useRef, useState } from "react";
import { path_split, path_to_file, plural } from "@cocalc/util/misc";
import { default_filename } from "@cocalc/frontend/account";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { useRedux } from "@cocalc/frontend/app-framework";
import { PRE_STYLE } from "./action-box";

export default function CreateArchive({}) {
  const inputRef = useRef<any>(null);
  const { actions } = useProjectContext();
  const checked_files = useRedux(["checked_files"], actions?.project_id ?? "");
  const [target, setTarget] = useState<string>(() => {
    if (checked_files?.size == 1) {
      return path_split(checked_files.toArray()[0]).tail;
    }
    return default_filename("", actions?.project_id ?? "");
  });

  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.select();
    }, 1);
  }, []);

  const doCompress = () => {
    if (actions == null) {
      return;
    }
    const store = actions.get_store();
    if (store == null) {
      return;
    }
    actions.zip_files({
      src: checked_files.toArray(),
      dest: path_to_file(store.get("current_path"), target + ".zip"),
    });
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
      <pre style={PRE_STYLE}>
        {checked_files.map((name) => (
          <div key={name}>{path_split(name).tail}</div>
        ))}
      </pre>
      <Space style={{ marginTop: "15px" }}>
        <Input
          ref={inputRef}
          autoFocus
          onChange={(e) => setTarget(e.target.value)}
          type="text"
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
        <Button onClick={doCompress} type="primary">
          Compress {checked_files?.size} {plural(checked_files?.size, "item")}
        </Button>
      </Space>
    </Card>
  );
}

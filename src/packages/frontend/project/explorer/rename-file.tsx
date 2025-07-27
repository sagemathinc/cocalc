import { Alert, Button, Card, Checkbox, Input, Space, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";

import { useRedux } from "@cocalc/frontend/app-framework";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import { labels } from "@cocalc/frontend/i18n";
import { useProjectContext } from "@cocalc/frontend/project/context";
import {
  filename_extension,
  path_split,
  path_to_file,
} from "@cocalc/util/misc";
import CheckedFiles from "./checked-files";

const MAX_FILENAME_LENGTH = 4095;

interface Props {
  duplicate?: boolean;
}

export default function RenameFile({ duplicate }: Props) {
  const intl = useIntl();
  const inputRef = useRef<any>(null);
  const { actions } = useProjectContext();
  const checked_files = useRedux(["checked_files"], actions?.project_id ?? "");
  const [target, setTarget] = useState<string>("");
  const ext = filename_extension(target);
  const [editExtension, setEditExtension] = useState<boolean>(!ext);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

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
      } else {
        await actions.rename_file(opts);
      }
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
        <Icon name="swap" /> {duplicate ? "Duplicate" : "Rename"} the file '
        {checked_files?.first()}'
      </>
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
            onPressEnter={doAction}
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
            onPressEnter={doAction}
            suffix={"." + ext}
          />
        )}
        <div style={{ marginLeft: "5px" }} />
        <Button
          onClick={() => {
            actions?.set_file_action();
          }}
        >
          {intl.formatMessage(labels.cancel)}
        </Button>{" "}
        <Button
          onClick={doAction}
          type="primary"
          disabled={
            !target ||
            loading ||
            target == path_split(checked_files?.first() ?? "").tail
          }
        >
          {duplicate ? "Duplicate" : "Rename"} File {loading && <Spin />}
        </Button>
      </Space>
      <div style={{ marginTop: "15px" }} />
      {!duplicate && (
        <Checkbox
          disabled={!ext}
          checked={editExtension}
          onChange={() => setEditExtension(!editExtension)}
        >
          Edit Filename Extension
        </Checkbox>
      )}
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
    </Card>
  );
}

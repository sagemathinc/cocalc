import { useState } from "react";
import { Alert, Button, Input, Modal, Progress, Space, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { ColumnsType } from "../../fields";
import { Set } from "immutable";
import { plural } from "@cocalc/util/misc";
import ShowError from "@cocalc/frontend/components/error";
import { map as awaitMap } from "awaiting";
const MAX_PARALLEL_TASKS = 15;

interface Props {
  title: string;
  onClose: () => void;
  selected: Set<any> | undefined;
  data: { account_id: string; tags?: string[] }[];
  primaryKey: string;
  columns: ColumnsType[];
  refresh: Function;
}

export default function TagAccounts({
  title,
  onClose,
  selected,
  data,
  primaryKey,
  columns,
  refresh,
}: Props) {
  console.log({ title, selected, data, primaryKey, columns });
  const [value, setValue] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string>("");

  if (selected == null) {
    return null;
  }

  const save = async () => {
    const tags = value
      .split(",")
      .map((x) => x.trim())
      .filter((x) => !!x);
    if (tags.length == 0 || selected == null || selected.size == 0) {
      setValue("");
      return;
    }
    const errors: string[] = [];
    const tagsByAccount: { [account_id: string]: string[] } = {};
    for (const { account_id, tags } of data) {
      tagsByAccount[account_id] = tags ?? [];
    }
    try {
      setProgress(0);
      setLoading(true);
      let done = 0;
      let goal = selected.size;
      const task = async (account_id) => {
        try {
          await webapp_client.async_query({
            query: {
              crm_accounts: {
                account_id,
                tags: tagsByAccount[account_id].concat(tags),
              },
            },
          });
        } catch (err) {
          errors.push(`${err}`);
        }
        done += 1;
        setProgress(Math.round((done * 100) / goal));
      };
      await awaitMap(Array.from(selected), MAX_PARALLEL_TASKS, task);
      setValue("");
    } finally {
      refresh();
      if (errors.length > 0) {
        setError(errors.join(" \n"));
      }
      setProgress(100);
      setLoading(false);
      if (errors.length == 0) {
        onClose();
      }
    }
  };

  return (
    <Modal
      open
      footer={null}
      title={
        <div style={{ margin: "0 15px" }}>
          <Icon name="tags-outlined" /> Tag {selected.size} Selected{" "}
          {plural(selected.size, "Account")}
        </div>
      }
      onCancel={onClose}
    >
      <div style={{ margin: "30px 15px" }}>
        <Space.Compact style={{ width: "100%" }}>
          <Input
            allowClear
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Tag or tag1,tag2,..."
            size="large"
          />
          <Button
            size="large"
            style={{ height: "41px" /* hack around antd bug?*/ }}
            disabled={!value.trim() || loading}
            onClick={() => {
              save();
            }}
          >
            Tag {plural(selected.size, "Account")} {loading && <Spin />}
          </Button>
        </Space.Compact>
        <Alert
          style={{ margin: "15px 0" }}
          type="info"
          message={
            <>The above tags will be applied to each selected account.</>
          }
        />
        {loading && (
          <div>
            <Progress percent={progress} />
          </div>
        )}
        {error && <hr />}
        <ShowError error={error} setError={setError} />
      </div>
    </Modal>
  );
}

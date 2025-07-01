import { useState } from "react";
import {
  Alert,
  Button,
  Input,
  Modal,
  Progress,
  Space,
  Spin,
  Switch,
} from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { ColumnsType } from "../../fields";
import { Set as iSet } from "immutable";
import { plural } from "@cocalc/util/misc";
import ShowError from "@cocalc/frontend/components/error";
import { map as awaitMap } from "awaiting";
const MAX_PARALLEL_TASKS = 15;

interface Props {
  title: string;
  onClose: () => void;
  selected: iSet<string> | undefined;
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
  const [add, setAdd] = useState<boolean>(true);

  if (selected == null) {
    return null;
  }

  const save = async () => {
    const tags0 = value
      .split(",")
      .map((x) => x.trim())
      .filter((x) => !!x);
    if (tags0.length == 0 || selected == null || selected.size == 0) {
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
      const check = () => {
        done += 1;
        setProgress(Math.round((done * 100) / goal));
      };

      const task = async (account_id) => {
        let tags;
        if (add) {
          tags = Array.from(
            new Set(tagsByAccount[account_id].concat(tags0)),
          ).sort();
        } else {
          const x = new Set(tagsByAccount[account_id]);
          const n = x.size;
          for (const tag of tags0) {
            x.delete(tag);
          }
          if (x.size == n) {
            check();
            return;
          }
          tags = Array.from(x).sort();
        }
        try {
          await webapp_client.async_query({
            query: {
              crm_accounts: {
                account_id,
                tags,
              },
            },
          });
        } catch (err) {
          errors.push(`${err}`);
        }
        check();
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
          <Icon name="tags-outlined" /> {add ? "Tag" : "Untag"} {selected.size}{" "}
          Selected {plural(selected.size, "Account")}
          <Switch
            style={{ float: "right", marginRight: "30px" }}
            checkedChildren="Add"
            unCheckedChildren="Remove"
            defaultChecked
            onChange={setAdd}
          />
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
          />
          <Button
            style={{ height: "37px" /* hack around antd bug?*/ }}
            disabled={!value.trim() || loading}
            onClick={() => {
              save();
            }}
          >
            {!add ? "Untag" : "Tag"} {plural(selected.size, "Account")}{" "}
            {loading && <Spin />}
          </Button>
        </Space.Compact>
        <Alert
          style={{ margin: "15px 0" }}
          type="info"
          message={
            <>
              The above tags will be {add ? "added to" : "removed from"} each
              selected account.
            </>
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

import { render } from "./register";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { AVATAR_SIZE } from "./account";
import useAgents from "../querydb/use-agents";
import { useEditableContext } from "./context";
import { Button, Select, Space } from "antd";
import { useTypedRedux } from "@cocalc/frontend/app-framework";

render({ type: "assignee" }, ({ field, obj, spec, viewOnly }) => {
  const { agentsMap } = useAgents();
  const your_account_id = useTypedRedux("account", "account_id");
  if (spec.type != "assignee") throw Error("bug");
  const account_id = obj[field];
  if (!account_id && viewOnly) return null;
  if (!viewOnly && spec.editable) {
    return (
      <EditAssignee obj={obj} field={field} your_account_id={your_account_id} />
    );
  } else {
    const agent = agentsMap?.[account_id];
    return (
      <Space>
        <Avatar key={account_id} account_id={account_id} size={AVATAR_SIZE} />
        {agent != null && (
          <span>
            {agent.first_name} {agent.last_name}{" "}
            {your_account_id == account_id ? " (you)" : undefined}
          </span>
        )}
      </Space>
    );
  }
});

function EditAssignee({ obj, field, your_account_id }) {
  const { save, error } = useEditableContext<string>(field);
  const { agentsArray } = useAgents();
  const options = (agentsArray ?? []).map((agent) => {
    return {
      label: (
        <Space>
          <Avatar account_id={agent.account_id} size={AVATAR_SIZE} />
          <span>
            {agent.first_name} {agent.last_name}{" "}
            {your_account_id == agent.account_id ? " (you)" : undefined}
          </span>
        </Space>
      ),
      value: agent.account_id,
    };
  });

  return (
    <div style={{ display: "inline-block" }}>
      <Space>
        <Select
          allowClear
          style={{ width: "250px" }}
          value={obj[field]}
          options={options}
          onChange={(value) => {
            console.log({ value });
            save(obj, value ? value : null);
          }}
        />
        {your_account_id != null && obj[field] != your_account_id && (
          <Button
            type="link"
            onClick={() => {
              save(obj, your_account_id);
            }}
          >
            Take It
          </Button>
        )}
      </Space>
      {error}
    </div>
  );
}

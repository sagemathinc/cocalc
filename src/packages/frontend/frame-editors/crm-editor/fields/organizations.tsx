// TODO: significant code duplication with accounts.tsx and people.tsx

import { useCallback, useMemo, useState } from "react";
import { render } from "./register";
import { Alert, Button, Input, List, Popconfirm, Select, Space } from "antd";
import { useEditableContext } from "./context";
import { CloseOutlined } from "@ant-design/icons";
import { Icon } from "@cocalc/frontend/components";
import {
  useOrganization,
  useOrganizationsSearch,
  OrganizationType,
} from "../querydb/use-organizations";
import { isEqual } from "lodash";

render({ type: "organizations" }, ({ field, obj, spec, viewOnly }) => {
  if (spec.type != "organizations") throw Error("bug");
  const organizations = obj[field];
  if (organizations == null && viewOnly) return null;
  if (!viewOnly && spec.editable) {
    return (
      <EditOrganizations
        obj={obj}
        field={field}
        organizations={organizations}
      />
    );
  } else {
    return <OrganizationsList organizations={organizations} inline />;
  }
});

function EditOrganizations({ obj, field, organizations }) {
  const { error: saveError, save: save0 } = useEditableContext<number[]>(field);
  const [adding, setAdding] = useState<boolean>(false);
  const save = useCallback(
    async (value: number[]) => {
      try {
        if (!isEqual(value, obj[field])) {
          await save0(obj, value);
        }
      } catch (_) {
      } finally {
        setAdding(false);
      }
    },
    [save0, obj, field]
  );

  return (
    <div>
      {adding && (
        <Button
          onClick={() => setAdding(false)}
          style={{ marginBottom: "5px" }}
        >
          Done
        </Button>
      )}
      {!adding && (
        <Button onClick={() => setAdding(true)}>
          <Icon name="plus-circle" /> Add
        </Button>
      )}
      {adding && (
        <AddOrganization
          multiple
          key="add-organization"
          organizations={organizations ?? []}
          save={save}
        />
      )}
      {saveError && <Alert message={saveError} type="error" />}
      {organizations != null && (
        <OrganizationsList organizations={organizations} save={save} />
      )}
    </div>
  );
}

function OrganizationsList({
  organizations,
  save,
  inline,
}: {
  organizations: number[];
  save?: (organizations: number[]) => Promise<void>;
  inline?: boolean;
}) {
  if (organizations.length == 0) return null;
  if (inline) {
    return (
      <div>
        {organizations.map((id) => (
          <Organization key={id} id={id} inline />
        ))}
      </div>
    );
  }
  return (
    <List
      style={{ maxHeight: "12em", overflow: "auto" }}
      itemLayout="vertical"
      dataSource={organizations}
      renderItem={(id: number) => (
        <List.Item>
          <Space>
            <Organization key={id} id={id} />
          </Space>
          {save != null && (
            <Popconfirm
              title="Remove this organization?"
              onConfirm={() => {
                save(organizations.filter((x) => x != id));
              }}
            >
              <Button type="link">
                <CloseOutlined />
              </Button>
            </Popconfirm>
          )}
        </List.Item>
      )}
    />
  );
}

export function AddOrganization({
  organizations,
  save,
  multiple,
}: {
  organizations: number[];
  save: (organizations: number[]) => Promise<void>;
  multiple?: boolean;
}) {
  const [query, setQuery] = useState<string>("");
  const { loading, error, matches } = useOrganizationsSearch(query);
  const newMatches = useMemo(() => {
    if (matches == null) return null;
    const x = new Set(organizations);
    return matches.filter(({ id }) => !x.has(id));
  }, [matches, organizations]);

  return (
    <div>
      {error && <Alert message={error} type="error" />}
      {(newMatches == null || newMatches.length == 0) && (
        <Input.Search
          allowClear
          autoFocus
          loading={loading}
          placeholder="Find organizations in the Organizations table by name or domain..."
          enterButton
          onSearch={setQuery}
        />
      )}
      {newMatches != null && newMatches.length == 0 && (
        <div>No new matching organizations</div>
      )}
      {newMatches != null && newMatches.length > 0 && (
        <SelectMatches
          multiple={multiple}
          matches={newMatches}
          addOrganizations={(newOrganizations: number[]) => {
            setQuery("");
            save(organizations.concat(newOrganizations));
          }}
        />
      )}
    </div>
  );
}

function SelectMatches({
  matches,
  addOrganizations,
  multiple,
}: {
  matches: OrganizationType[];
  addOrganizations: (newOrganizations: number[]) => void;
  multiple?: boolean;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  if (matches.length == 0) {
    return <div>No results</div>;
  }

  const options: { label: string; value: number }[] = [];
  for (const match of matches) {
    options.push({
      label: `${match.name}${match.domain ? " (" + match.domain + ")" : ""}`,
      value: match.id,
    });
  }
  return (
    <Select
      open
      autoFocus
      mode={multiple ? "multiple" : undefined}
      allowClear
      style={{ width: "100%" }}
      placeholder="Select organizations to associate with this organization..."
      defaultValue={multiple ? [] : undefined}
      onChange={setSelected}
      options={options}
      filterOption={(input, option) =>
        (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
      }
      onBlur={() => {
        addOrganizations(selected);
      }}
    />
  );
}

export function Organization({ id, inline }: { id: number; inline?: boolean }) {
  const organization = useOrganization(id);
  return (
    <div
      style={
        inline
          ? {
              textOverflow: "ellipsis",
              width: "200px",
              overflow: "auto",
              whiteSpace: "nowrap",
              display: "inline-block",
            }
          : { padding: "5px", border: "1px solid #ddd" }
      }
    >
      {organization == null
        ? "..."
        : `${organization.name}${
            organization.domain ? " -- " + organization.domain : ""
          }`}
    </div>
  );
}

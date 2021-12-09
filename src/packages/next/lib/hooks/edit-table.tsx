import { CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";
import useDatabase from "lib/hooks/database";
import SaveButton from "components/misc/save-button";
import { get, set, cloneDeep, keys } from "lodash";
import { Space } from "antd";
import { SCHEMA } from "@cocalc/util/schema";
import Checkbox from "components/misc/checkbox";
import IntegerSlider from "components/misc/integer-slider";
import SelectWithDefault from "components/misc/select-with-default";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { capitalize } from "@cocalc/util/misc";

export default function useEditTable<T>(query) {
  const { loading, value } = useDatabase(query);
  const [original, setOriginal] = useState<T | undefined>(undefined);
  const [edited, setEdited] = useState<T | undefined>(undefined);

  useEffect(() => {
    if (!loading) {
      setOriginal(cloneDeep(value[keys(value)[0]]));
      setEdited(value[keys(value)[0]]);
    }
  }, [loading]);

  function Save() {
    if (edited == null || original == null) return null;
    return (
      <div>
        <SaveButton
          style={{ marginBottom: "10px" }}
          edited={edited}
          original={original}
          setOriginal={setOriginal}
          table={keys(query)[0]}
        />
      </div>
    );
  }

  function EditBoolean({
    path,
    title,
    desc,
    label,
    icon,
  }: {
    path: string;
    title?: string;
    desc?: ReactNode;
    label?: string;
    icon?: IconName;
  }) {
    return (
      <Space direction="vertical" style={{ marginTop: "15px" }}>
        <h3>
          {icon && <Icon name={icon} style={{ marginRight: "10px" }} />}
          {getTitle(path, title)}
        </h3>
        {desc && <div>{desc}</div>}
        <Checkbox
          defaultValue={get(
            SCHEMA[keys(query)[0]].user_query?.get?.fields,
            path
          )}
          checked={get(edited, path)}
          onChange={(checked) => {
            set(edited, path, checked);
            setEdited(cloneDeep(edited));
          }}
        >
          {getLabel(path, title, label)}
        </Checkbox>
      </Space>
    );
  }

  // It's very important EditNumber isn't recreated once
  // edited and original are both not null, since the text
  // field would then lose focus.  Also, it has to not be
  // a controlled component, since otherwise edited has to
  // be passed in externally, which is very awkward.
  const EditNumber = useMemo(() => {
    if (edited == null || original == null) return () => null;
    return ({
      path,
      title,
      desc,
      units,
      min,
      max,
      icon,
    }: {
      path: string;
      title?: string;
      desc?: ReactNode;
      units?: string;
      min: number;
      max: number;
      icon?: IconName;
    }) => (
      <Space direction="vertical">
        <h3>
          {icon && <Icon name={icon} style={{ marginRight: "10px" }} />}
          {getTitle(path, title)}
        </h3>
        {desc && <div>{desc}</div>}
        <IntegerSlider
          defaultValue={get(
            SCHEMA[keys(query)[0]].user_query?.get?.fields,
            path
          )}
          initialValue={get(edited, path)}
          onChange={(value) => {
            set(edited, path, value);
            setEdited(cloneDeep(edited));
          }}
          min={min}
          max={max}
          units={units}
        />
      </Space>
    );
  }, [edited == null, original == null]);

  const EditSelect = useMemo(() => {
    if (edited == null || original == null) return () => null;
    return ({
      path,
      title,
      desc,
      icon,
      options,
      style,
    }: {
      path: string;
      title?: string;
      desc?: ReactNode;
      icon?: IconName;
      options: { [value: string]: ReactNode };
      style?: CSSProperties;
    }) => (
      <Space direction="vertical">
        <h3>
          {icon && <Icon name={icon} style={{ marginRight: "10px" }} />}
          {getTitle(path, title)}
        </h3>
        {desc && <div>{desc}</div>}
        <SelectWithDefault
          style={style}
          defaultValue={get(
            SCHEMA[keys(query)[0]].user_query?.get?.fields,
            path
          )}
          initialValue={get(edited, path)}
          onChange={(value) => {
            set(edited, path, value);
            setEdited(cloneDeep(edited));
          }}
          options={options}
        />
      </Space>
    );
  }, [edited == null, original == null]);

  return {
    edited,
    setEdited: (x) => setEdited(cloneDeep(x)),
    original,
    Save,
    EditBoolean,
    EditNumber,
    EditSelect,
  };
}

function getTitle(path: string, title?: string): string {
  if (title) return title;
  if (!path) return "";
  const v = path.split(".");
  return v[v.length - 1].split("_").map(capitalize).join(" ");
}

function getLabel(path: string, title?: string, label?: string): string {
  return label ?? capitalize(getTitle(path, title).toLowerCase());
}

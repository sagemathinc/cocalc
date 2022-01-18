/* Select component to choose from one of the licenses that you manage */

import { CSSProperties, ReactNode } from "react";
import useAPI from "lib/hooks/api";
import Loading from "components/share/loading";
import { Quota } from "./license";
import { Alert, Select } from "antd";
const { Option } = Select;
import { search_split, search_match } from "@cocalc/util/misc";

interface Props {
  onSelect: (license_id: string) => void;
  license?: string;
  style?: CSSProperties;
  disabled?: boolean;
}

export default function SelectLicense({
  onSelect,
  license,
  style,
  disabled,
}: Props) {
  let { result, error } = useAPI("licenses/get-managed");
  if (error) {
    return <Alert type="error" message={error} />;
  }
  if (!result) {
    return <Loading style={{ fontSize: "16pt", margin: "auto" }} />;
  }

  const v: ReactNode[] = [];
  for (const x of result) {
    v.push(
      <Option
        value={x.id}
        key={x.id}
        search={`${x.id} ${x.title} ${x.description} ${JSON.stringify(
          x.quota
        )}`.toLowerCase()}
      >
        {x.title?.trim() ? `${x.title} - ` : ''}<span style={{ fontFamily: "monospace" }}>{x.id}</span>
        <br />
        <Quota quota={x.quota} />
      </Option>
    );
  }

  return (
    <Select
      style={style}
      disabled={disabled}
      showSearch
      allowClear
      placeholder="Select a license"
      optionFilterProp="children"
      value={
        license ? license : undefined /* no empty string so placeholder works */
      }
      onChange={onSelect}
      filterOption={(input, option) => {
        if (!input.trim()) return true;
        return search_match(option?.search ?? "", search_split(input));
      }}
    >
      {v}
    </Select>
  );
}

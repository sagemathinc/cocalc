/*
Array of strings that are meant to be interpreted as tags.
This is much less complicated than the normal tags that map
to integers in the CRM. These are used at least for
accounts for users to indicate their interests.
*/
import { Tag } from "antd";

import { render } from "./register";

render({ type: "string-tags" }, ({ field, obj }) => {
  const tags = obj[field];
  if (tags == null) return null;
  return (
    <div style={{ lineHeight: "2em", display: "inline-block" }}>
      {tags.map((value) => (
        <Tag key={value}>{value}</Tag>
      ))}
    </div>
  );
});

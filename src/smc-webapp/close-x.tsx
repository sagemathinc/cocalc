import * as React from "react";

const closex_style: React.CSSProperties = {
  float: "right",
  marginLeft: "5px"
};

export function CloseX({
  on_close,
  style
}: {
  on_close: () => void;
  style?: React.CSSProperties;
}) {
  const onClick = e => {
    e.preventDefault();
    on_close();
  };

  return (
    <a href="" style={closex_style} onClick={onClick}>
      <Icon style={style} name="times" />
    </a>
  );
}

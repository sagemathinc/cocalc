import * as React from "react";

export function A(url, display) {
  return (
    <a href={url} target={"_blank"} rel={"noopener"}>
      {display}
    </a>
  );
}

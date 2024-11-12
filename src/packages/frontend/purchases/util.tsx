import { Button, Divider, Flex, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { capitalize, plural } from "@cocalc/util/misc";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { useState } from "react";

export function describeNumberOf({
  n,
  hasMore,
  loadMore,
  loading,
  type,
  adjective = "",
}) {
  type = capitalize(type);
  adjective = capitalize(adjective);
  if (n == null) {
    return type;
  }
  if (n == 0) {
    return (
      <>
        No {adjective} {plural(0, type)}
      </>
    );
  }
  if (hasMore) {
    return (
      <>
        Most Recent {n} {adjective} {plural(n, type)}{" "}
        <Button type="link" disabled={loading} onClick={() => loadMore()}>
          load more
        </Button>
      </>
    );
  }
  if (n == 1) {
    return (
      <>
        {adjective} {type}
      </>
    );
  }
  return (
    <>
      {n} {adjective} {plural(n, type)}
    </>
  );
}

export function SectionDivider({ onRefresh, loading, children }) {
  return (
    <Flex>
      <div style={{ flex: 1 }}>
        <Divider orientation="left">
          {children}
          {loading && <Spin style={{ marginLeft: "15px" }} />}
        </Divider>
      </div>
      <Button
        disabled={loading}
        style={{ marginTop: "15px" }}
        type="link"
        onClick={() => {
          onRefresh();
        }}
      >
        <Icon name="refresh" /> Refresh
      </Button>
    </Flex>
  );
}

export function RawJson({
  value,
  style,
  label = "Raw",
  defaultOpen,
}: {
  value: object;
  style?;
  label?;
  defaultOpen?: boolean;
}) {
  const [show, setShow] = useState<boolean>(!!defaultOpen);
  return (
    <>
      <Button
        type="link"
        onClick={() => setShow(!show)}
        style={{ marginLeft: "-15px" }}
      >
        <Icon name={show ? "angle-down" : "angle-right"} /> {label}
      </Button>
      {show && (
        <div style={style}>
          <StaticMarkdown
            value={"```json\n" + JSON.stringify(value, undefined, 2) + "\n```"}
          />
        </div>
      )}
    </>
  );
}

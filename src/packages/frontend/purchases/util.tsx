import { Button, Divider, Flex, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { capitalize, plural } from "@cocalc/util/misc";

export function describeNumberOf({ n, hasMore, loadMore, loading, type }) {
  type = capitalize(type);
  if (n == null) {
    return type;
  }
  if (n == 0) {
    return <>No {plural(0, type)}</>;
  }
  if (hasMore) {
    return (
      <>
        Most Recent {n} {plural(n, type)}{" "}
        <Button type="link" disabled={loading} onClick={() => loadMore()}>
          load more
        </Button>
      </>
    );
  }
  if (n == 1) {
    return <>{type}</>;
  }
  return (
    <>
      All {n} {plural(n, type)}
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

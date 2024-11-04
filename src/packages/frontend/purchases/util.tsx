import { Button } from "antd";
import { capitalize, plural } from "@cocalc/util/misc";

export function describeNumberOf({ n, hasMore, loadMore, loading, type }) {
  type = capitalize(type);
  if (n == null) {
    return type;
  }
  if (n == 0) {
    return "(none yet)";
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
  return (
    <>
      All {n} {plural(n, type)}
    </>
  );
}

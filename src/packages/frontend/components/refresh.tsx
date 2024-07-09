import { Button } from "antd";
import { Icon } from "./icon";
import { CSSProperties, useState } from "react";
import ShowError from "@cocalc/frontend/components/error";

interface Props {
  refresh: Function;
  style?: CSSProperties;
  refreshing?;
  setRefreshing?;
}

export default function Refresh({
  refresh,
  style,
  refreshing,
  setRefreshing,
}: Props) {
  if (refreshing == null) {
    return <UnControlled refresh={refresh} style={style} />;
  } else {
    return (
      <Controlled
        refresh={refresh}
        style={style}
        refreshing={refreshing}
        setRefreshing={setRefreshing}
      />
    );
  }
}

function UnControlled({ refresh, style }) {
  const [refreshing, setRefreshing] = useState<boolean>(false);
  return (
    <Controlled
      refresh={refresh}
      style={style}
      refreshing={refreshing}
      setRefreshing={setRefreshing}
    />
  );
}

function Controlled({ refresh, style, refreshing, setRefreshing }) {
  const [error, setError] = useState<string>("");
  return (
    <>
      <Button
        onClick={async () => {
          try {
            setError("");
            setRefreshing?.(true);
            await refresh();
          } catch (err) {
            setError(`${err}`);
          } finally {
            setRefreshing?.(false);
          }
        }}
        style={style}
      >
        <Icon name="refresh" spin={refreshing} /> Refresh
      </Button>
      <ShowError error={error} setError={setError} />
    </>
  );
}

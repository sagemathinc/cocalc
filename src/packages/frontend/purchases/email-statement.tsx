import { CSSProperties, useState } from "react";
import { emailStatement } from "./api";
import { Button, Popconfirm, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import ShowError from "@cocalc/frontend/components/error";
import { useTypedRedux } from "@cocalc/frontend/app-framework";

interface Props {
  statement_id: number;
  style?: CSSProperties;
}

export default function EmailStatement({ statement_id, style }: Props) {
  const email_address: string | undefined = useTypedRedux(
    "account",
    "email_address"
  );
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const send = async () => {
    try {
      setLoading(true);
      await emailStatement(statement_id);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={style}>
      <ShowError error={error} setError={setError} />
      <Popconfirm
        onConfirm={send}
        title={"Email Statement?"}
        description={
          <div style={{ maxWidth: "400px" }}>
            Email this complete statement with all transactions to you at{" "}
            <code>{email_address}</code>?
          </div>
        }
      >
        <Button disabled={!email_address}>
          <Icon name="paper-plane" /> Email...
          {loading && <Spin />}
        </Button>
      </Popconfirm>
    </div>
  );
}

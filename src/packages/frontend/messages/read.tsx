import { getBitField } from "./util";
import User from "./user";
import { useMemo } from "react";
import type { Message } from "@cocalc/util/db-schema/messages";

export default function Read({ message, style }: { message: Message; style? }) {
  const { hasRead, notRead } = useMemo(() => {
    if (message?.to_ids == null) {
      return {};
    }
    const hasRead: string[] = [];
    const notRead: string[] = [];
    for (const account_id of message?.to_ids) {
      if (getBitField(message, "read", account_id)) {
        hasRead.push(account_id);
      } else {
        notRead.push(account_id);
      }
    }
    return { hasRead, notRead };
  }, [message?.to_ids, message?.read]);

  if (hasRead == null || notRead == null) {
    return null;
  }

  return (
    <div style={style}>
      <ul>
        {notRead.length > 0 && (
          <li style={{ marginBottom: "10px" }}>
            Not read by <User id={notRead} message={null} />.
          </li>
        )}
        {hasRead.length > 0 && (
          <li>
            Read by <User id={hasRead} message={null} />.{" "}
          </li>
        )}
      </ul>
    </div>
  );
}

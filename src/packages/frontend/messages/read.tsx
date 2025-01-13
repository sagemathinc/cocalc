import { useMemo } from "react";
import { defineMessage, useIntl } from "react-intl";

import type { Message } from "@cocalc/util/db-schema/messages";
import User from "./user";
import { getBitField } from "./util";

const READ_BY = defineMessage({
  id: "messages.read_by",
  defaultMessage: `{read, select, true {Read by} other {Not read by}} {user}.`,
});

export default function Read({ message, style }: { message: Message; style? }) {
  const intl = useIntl();

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
            {intl.formatMessage(READ_BY, {
              read: false,
              user: <User id={notRead} message={null} />,
            })}
          </li>
        )}
        {hasRead.length > 0 && (
          <li>
            {intl.formatMessage(READ_BY, {
              read: true,
              user: <User id={hasRead} message={null} />,
            })}
          </li>
        )}
      </ul>
    </div>
  );
}

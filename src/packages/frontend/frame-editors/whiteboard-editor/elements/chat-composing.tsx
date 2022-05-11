import { redux } from "@cocalc/frontend/app-framework";
import { ReactNode, useMemo, useState } from "react";
import { useIsMountedRef } from "@cocalc/frontend/app-framework";
import { Message } from "./chat";

export default function Composing({ element, focused }) {
  const isMountedRef = useIsMountedRef();
  const [counter, setCounter] = useState<number>(0);

  const mesg = useMemo(() => {
    const cutoff = new Date().valueOf() - 1000 * 60;
    const v: ReactNode[] = [];
    for (const sender_id in element.data ?? {}) {
      if (sender_id.length != 36) continue;
      const { input, time } = element.data[sender_id] ?? {};
      if (
        input?.trim() &&
        time != null &&
        (time >= cutoff ||
          sender_id == redux.getStore("account").get_account_id()) && // condition on sender_id is to ALWAYS show your own chat as composing, so you are reminded to finish it.
        (!focused || sender_id != redux.getStore("account").get_account_id())
      ) {
        v.push(
          <Message key={sender_id} element={element} messageId={sender_id} />
        );
      }
    }
    if (v.length > 0) {
      // Always check again in 5s if somebody was composing,
      // since maybe they are no longer composing.  Incrementing
      // counter causes another check.
      setTimeout(() => {
        if (isMountedRef.current) {
          setCounter(counter + 1);
        }
      }, 5000);
    }
    return <div>{v}</div>;
  }, [element.data, focused, counter]);

  return mesg;
}

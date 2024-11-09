/*
Page that you show user after they start a purchase and are waiting
for the payment to be completed and items to be allocated.
*/

import ShowError from "@cocalc/frontend/components/error";
import { Alert, Button, Spin } from "antd";
import Loading from "components/share/loading";
import useAPI from "lib/hooks/api";
import useIsMounted from "lib/hooks/mounted";
import A from "components/misc/A";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";

export default function Processing() {
  const [finished, setFinished] = useState<boolean>(false);
  const items = useAPI("/shopping/cart/processing");
  // get payments created in the last hour
  const payments = useAPI("purchases/stripe/get-payments", {
    created: { gt: Math.round(Date.now() / 1000 - 3600) },
  });
  useEffect(() => {
    if (!items.error && items.result != null && items.result.length == 0) {
      setFinished(true);
    }
  }, [items]);

  const lastRefreshRef = useRef<number>(0);
  const refreshRef = useRef<Function>(() => {});
  refreshRef.current = () => {
    const now = Date.now();
    if (now - lastRefreshRef.current < 3000) {
      return;
    }
    lastRefreshRef.current = now;
    items.refresh();
    payments.refresh();
  };

  // exponential backoff auto-refresh
  const isMounted = useIsMounted();
  const timeoutRef = useRef<any>(null);
  useEffect(() => {
    if (finished) {
      // nothing left to do
      return;
    }
    let delay = 5000;
    const f = () => {
      if (!isMounted.current) {
        return;
      }
      delay = Math.min(5 * 60 * 1000, 1.3 * delay);
      timeoutRef.current = setTimeout(f, delay);
      refreshRef.current();
    };
    timeoutRef.current = setTimeout(f, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [finished]);

  const loading =
    !items.result || !payments.result || items.calling || payments.calling;

  function renderBody() {
    if (items.error) {
      return <ShowError error={items.error} />;
    }
    if (payments.error) {
      return <ShowError error={payments.error} />;
    }
    if (finished) {
      return (
        <Alert
          type="success"
          showIcon
          style={{ margin: "30px auto", maxWidth: "700px" }}
          message="Success"
          description=<>
            Congratulations, all your purchases have been processed and are
            ready to use!
            <br />
            <br />
            <A href="/store/congrats">Congrats! View Your Items...</A>
          </>
        />
      );
    }

    return (
      <>
        <pre>{JSON.stringify(payments.result?.data, undefined, 2)}</pre>
        <pre>{JSON.stringify(items.result, undefined, 2)}</pre>
      </>
    );
  }

  return (
    <div>
      <Button
        style={{ float: "right" }}
        disabled={loading}
        onClick={() => {
          refreshRef.current();
        }}
      >
        Refresh {loading && <Spin />}
      </Button>
      <h3><Icon name="run"/> Processing Your Order</h3>
      {loading && <Loading large center />}
      {renderBody()}
    </div>
  );
}

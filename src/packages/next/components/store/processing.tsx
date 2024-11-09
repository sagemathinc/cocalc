/*
Page that you show user after they start a purchase and are waiting
for the payment to be completed and items to be allocated.
*/

import ShowError from "@cocalc/frontend/components/error";
import { Alert, Button } from "antd";
import Loading from "components/share/loading";
import useAPI from "lib/hooks/api";
import A from "components/misc/A";
import { useEffect, useState } from "react";

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

  const loading = !items.result || !payments.result;

  function renderBody() {
    if (items.error) {
      return <ShowError error={items.error} />;
    }
    if (payments.error) {
      return <ShowError error={payments.error} />;
    }
    if (loading) {
      return <Loading large center />;
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
        disabled={loading}
        onClick={() => {
          items.refresh();
          payments.refresh();
        }}
      >
        Refresh
      </Button>
      {renderBody()}
    </div>
  );
}

/*
Page that you show user after they start a purchase and are waiting
for the payment to be completed and items to be allocated.
*/

import ShowError from "@cocalc/frontend/components/error";
import { Alert, Button, Divider, Spin, Table } from "antd";
import Loading from "components/share/loading";
import useIsMounted from "lib/hooks/mounted";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { type CheckoutParams } from "@cocalc/server/purchases/shopping-cart-checkout";
import Payments from "@cocalc/frontend/purchases/payments";
import { getColumns } from "./checkout";
import {
  getPayments,
  getShoppingCartCheckoutParams,
} from "@cocalc/frontend/purchases/api";
import { SHOPPING_CART_CHECKOUT } from "@cocalc/util/db-schema/purchases";
import { useRouter } from "next/router";

export default function Processing() {
  const router = useRouter();
  const [finished, setFinished] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [params, setParams] = useState<CheckoutParams | null>(null);
  const refreshPaymentsRef = useRef<any>(null);
  const numPaymentsRef = useRef<number | null>(null);
  const updateParams = async () => {
    try {
      setError("");
      setLoading(true);
      // This is entirely to make sure that any recent payments that have succeeded
      // do get processed, i.e., the items in the cart get sent to the user.  This
      // would happen without the call (eventually) or may happen due to payment update,
      // but we want it to happen *now* if possible.
      await getPayments({ limit: 3 });
      // Get what has NOT been processed.
      const params = await getShoppingCartCheckoutParams({
        processing: true,
      });
      setParams(params);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (
      params?.cart != null &&
      params.cart.length == 0 &&
      numPaymentsRef.current === 0
    ) {
      setFinished(true);
    }
  }, [params]);

  const lastRefreshRef = useRef<number>(0);
  const refreshRef = useRef<Function>(() => {});
  refreshRef.current = async () => {
    const now = Date.now();
    if (now - lastRefreshRef.current < 3000) {
      return;
    }
    lastRefreshRef.current = now;
    await updateParams();
    await refreshPaymentsRef.current?.();
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
    f();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [finished]);

  function renderBody() {
    if (error) {
      return <ShowError error={error} setError={setError} />;
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
            <div style={{ textAlign: "center", marginTop: "30px" }}>
              <Button
                size="large"
                type="primary"
                onClick={() => {
                  router.push("/store/congrats");
                }}
              >
                Congrats! View Your Items...
              </Button>
            </div>
          </>
        />
      );
    }

    if (params?.cart == null) {
      return null;
    }

    return (
      <>
        {(numPaymentsRef.current ?? 0) > 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ margin: "30px auto", maxWidth: "700px" }}
            message="Status"
            description=<>
              Your items will be added to your account when the outstanding
              payment listed below goes through. You can update any payment
              configuration or cancel an unfinished order below.
            </>
          />
        )}

        {numPaymentsRef.current === 0 && (
          <Alert
            type="success"
            showIcon
            style={{ margin: "30px auto", maxWidth: "700px" }}
            message="Thank you"
            description=<>Your items should be allocated soon!</>
          />
        )}

        <Payments
          unfinished
          purpose={SHOPPING_CART_CHECKOUT}
          refresh={() => {
            refreshRef.current();
          }}
          numPaymentsRef={numPaymentsRef}
          refreshPaymentsRef={refreshPaymentsRef}
        />

        <Divider orientation="left" style={{ marginTop: "30px" }}>
          Your Items
        </Divider>
        {params != null && (
          <Table
            showHeader={false}
            columns={getColumns()}
            dataSource={params?.cart}
            rowKey={"id"}
            pagination={{ hideOnSinglePage: true }}
          />
        )}
      </>
    );
  }

  return (
    <div>
      <Button
        style={{ float: "right" }}
        disabled={loading || finished}
        onClick={() => {
          refreshRef.current();
        }}
      >
        Check Order Status {loading && <Spin />}
      </Button>
      <h3>
        <Icon name="run" /> Processing Your Order
      </h3>
      {loading && <Loading large center />}
      {renderBody()}
    </div>
  );
}

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { CSSProperties, useState } from "react";
import { Button, Divider, Popconfirm, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { resetClosingDate } from "./api";
import ShowError from "@cocalc/frontend/components/error";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { resetDay } from "@cocalc/util/purchases/closing-date";

interface Props {
  style?: CSSProperties;
}

export default function ClosingDate({ style }: Props) {
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const purchase_closing_day: number | undefined = useTypedRedux(
    "account",
    "purchase_closing_day"
  );

  const doReset = async () => {
    if (resetDay(webapp_client.server_time()) == purchase_closing_day) {
      // no op
      return;
    }
    try {
      setLoading(true);
      await resetClosingDate();
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  const day = resetDay(webapp_client.server_time());
  return (
    <div style={style}>
      <ShowError error={error} setError={setError} />
      <Popconfirm
        onConfirm={doReset}
        title=<>
          Closing Date:{" "}
          {purchase_closing_day ? (
            <>Day {purchase_closing_day} of each month</>
          ) : (
            <>not set</>
          )}
        </>
        okText={"Reset Date"}
        description={
          <div style={{ maxWidth: "500px" }}>
            {purchase_closing_day != null ? (
              <>
                Your <b>subscriptions renew</b> and your{" "}
                <b>monthly statement is created</b> on day{" "}
                {purchase_closing_day} of each month.
                <Divider>Reset Closing Date?</Divider>
                {day != purchase_closing_day ? (
                  <>
                    Click "Reset Date" below to reset your closing day to{" "}
                    <b>day {day} of each month</b>. This will change the renewal
                    date of all of your subscriptions and update the
                    corresponding licenses,{" "}
                    <b>
                      which may result in a small credit or debit to your
                      account
                    </b>
                    , and a new statement for current charges.
                  </>
                ) : (
                  <>
                    To change your closing date, visit this dialog on the day
                    you want to change it to (or possibly the day before).
                  </>
                )}
              </>
            ) : (
              <>
                You do not have a closing day set yet. Click "Reset Date" to set
                it to day {day} of each month.
              </>
            )}
          </div>
        }
      >
        {" "}
        <Button disabled={loading}>
          <Icon name="calendar" />
          Closing Date... {loading && <Spin style={{ marginLeft: "8px" }} />}
        </Button>
      </Popconfirm>
    </div>
  );
}

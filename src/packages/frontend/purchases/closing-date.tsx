import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { useState } from "react";
import { Button, Divider, Modal, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { resetClosingDate } from "./api";
import ShowError from "@cocalc/frontend/components/error";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { resetDay } from "@cocalc/util/purchases/closing-date";

export default function ClosingDate(props) {
  const [open, setOpen] = useState<boolean>(false);

  return (
    <>
      <Button {...props} onClick={() => setOpen(true)}>
        <Icon name="calendar" />
        Closing Date
      </Button>
      {open && (
        <ClosingDateModal
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function ClosingDateModal({ onClose }) {
  const day = resetDay(webapp_client.server_time());
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const purchase_closing_day: number | undefined = useTypedRedux(
    "account",
    "purchase_closing_day",
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

  return (
    <Modal
      width="500px"
      open
      title=<>
        <Icon name="calendar" style={{ marginRight: "15px" }} /> Closing Date:{" "}
        {purchase_closing_day ? (
          <>Day {purchase_closing_day} of each month</>
        ) : (
          <>not set</>
        )}
      </>
      onCancel={onClose}
      onOk={onClose}
    >
      <ShowError error={error} setError={setError} />

      <div style={{ maxWidth: "500px" }}>
        {purchase_closing_day != null ? (
          <>
            Your <b>monthly statement is created</b> on day{" "}
            {purchase_closing_day} of each month, and if you have a negative
            balance a payment will be created then. Also tracking of monthly
            spend on pay as you go purchases uses the closing date.
            <Divider>Reset Closing Date?</Divider>
            {day != purchase_closing_day ? (
              <>
                Click "Reset Date" below to reset your closing day to today,
                which is <b>day {day} of each month</b>.
              </>
            ) : (
              <>
                To change your closing date, visit this dialog on the day you
                want to change it to (or possibly the day before).
              </>
            )}
          </>
        ) : (
          <>
            You do not have a closing day set yet. Click "Reset Date" to set it
            to day {day} of each month.
          </>
        )}

        <div style={{ textAlign: "center", margin: "15px 0" }}>
          <Button
            onClick={doReset}
            disabled={loading}
            size="large"
            type="primary"
          >
            Reset Date {loading && <Spin style={{ marginLeft: "15px" }} />}
          </Button>
        </div>
        <Divider />
      </div>
    </Modal>
  );
}

/*
Show a Refund... button.  When clicked, shows modal to enter reason and notes,
and submit the refund.  The backend then has stripe do the refund, and also creates
a service="refund" transaction.

NOTE: we do not implement partial refunds, since it's **really complicated** to even
figure out *what* to refund, due to sales tax, currency conversion rates, etc.  If we ever
need to deal with that, maybe something can be done manually.  It's pretty rare,
and can at least be done via stripe directly in terms of providing money back,
and we could manually create a corresponding refund transaction to match that.
I had implemented this and realized that its super hard to get right given tax, etc.
*/

import { Icon } from "@cocalc/frontend/components/icon";
import { useState } from "react";
import { Button, Modal, Input, Select, Form, Divider } from "antd";
import { adminCreateRefund } from "./api";
import ShowError from "@cocalc/frontend/components/error";
import { BigSpin } from "./stripe-payment";
import type { Service } from "@cocalc/util/db-schema/purchases";
import { currency } from "@cocalc/util/misc";

const DEFAULT_REASON = "requested_by_customer";

export function isRefundable(service, invoice_id) {
  if (service == "credit" || service == "auto-credit") {
    return !!invoice_id;
  }
  return service == "license" || service == "edit-license";
}

const labelStyle = { width: "60px" } as const;

export default function AdminRefund({
  purchase_id,
  service,
  cost,
  refresh,
}: {
  purchase_id: number;
  service: Service;
  cost: number;
  refresh?;
}) {
  const [error, setError] = useState<string>("");
  const [refunding, setRefunding] = useState<boolean>(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm(); // Add this line

  const showModal = () => {
    setError("");
    setIsModalVisible(true);
  };

  const handleOk = async () => {
    const values = { ...form.getFieldsValue(), reason: DEFAULT_REASON }; // Get the form data
    try {
      setRefunding(true);
      await adminCreateRefund({ purchase_id, ...values });
      setIsModalVisible(false);
      refresh?.();
    } catch (err) {
      setError(`${err}`);
    } finally {
      setRefunding(false);
    }
  };

  const handleCancel = () => {
    setError("");
    setIsModalVisible(false);
  };

  const amount = Math.abs(cost);

  return (
    <>
      <Button onClick={showModal}>Admin Refund</Button>
      <Modal
        title=<>
          <Icon name="reply" style={{ marginRight: "8px" }} /> Admin Refund
        </>
        visible={isModalVisible}
        onOk={handleOk}
        onCancel={handleCancel}
        okText="Refund"
        okButtonProps={{ disabled: refunding }}
      >
        {(service == "credit" || service == "auto-credit") && (
          <>
            The corresponding payment intent will be fully refunded and the
            amount {currency(amount, 2)} of this credit will be deducted from
            the account and listed as a new refund transaction "Refund
            Transaction {purchase_id}".
          </>
        )}
        {service == "license" && (
          <>
            The license will be immediately expired, and the{" "}
            <b>full amount {currency(amount, 2)} paid for this license</b> will
            be credited to the account as a new credit "Credit for Refunded
            Transaction {purchase_id}".
          </>
        )}
        {service == "edit-license" && (
          <>
            The effect of this edit to the license will be fully reversed, and
            the <b>full cost {currency(amount, 2)} of this edit</b> will be
            credited to the account as a new credit "Credit for Refunded
            Transaction {purchase_id}".
          </>
        )}
        <Divider />
        <Form form={form}>
          <Form.Item name="reason" label={<div style={labelStyle}>Reason</div>}>
            <Select
              style={{ width: "100%" }}
              placeholder="Select Reason..."
              defaultValue={DEFAULT_REASON}
            >
              <Select.Option value="duplicate">Duplicate</Select.Option>
              <Select.Option value="fraudulent">Fraudulent</Select.Option>
              <Select.Option value="requested_by_customer">
                Requested by Customer
              </Select.Option>
              <Select.Option value="other">Other</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="notes" label={<div style={labelStyle}>Notes</div>}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <div style={{ color: "#666" }}>
            <Divider>What Happens: more details</Divider>
            The above information will be visible to the user.
            {(service == "credit" || service == "auto-credit") && (
              <>
                When you click OK, their money will be refunded in 5-10 days,
                and their CoCalc transactions log and statement will include a
                new "Refund" entry immediately (click Refresh to confirm). They
                will also be sent a message. Stripe's fees for the original
                payment won't be returned, but there are no additional fees for
                the refund. This refund will use the latest Stripe-provided
                exchange rate, which may differ from the original rate. (Partial
                refunds are not implemented.)
              </>
            )}
            {!(service == "credit" || service == "auto-credit") && <></>}
          </div>
        </Form>
        {refunding && <BigSpin />}
        <ShowError
          error={error}
          setError={setError}
          style={{ margin: "15px 0" }}
        />
      </Modal>
    </>
  );
}

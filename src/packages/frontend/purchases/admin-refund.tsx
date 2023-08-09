/*
Show a Refund... button.  When clicked, shows modal and uses API to get information from database
about status of refunding the given purchase and form to enter reason and notes,
and submit the refund.  The backend then has stripe do the refund, and also creates
a service="refund" transaction.
*/

import { Icon } from "@cocalc/frontend/components/icon";
import { useState } from "react";
import { Button, Modal, Input, InputNumber, Select, Form, Divider } from "antd";
const labelStyle = { width: "60px" } as const;

export default function AdminRefund({ purchase_id }: { purchase_id: number }) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm(); // Add this line

  // Replace with actual function that fetches refund details
  const fetchRefundInfo = async () => {
    console.log("Fetching refund information");
  };

  const showModal = () => {
    fetchRefundInfo();
    setIsModalVisible(true);
  };

  const handleOk = () => {
    const values = form.getFieldsValue(); // Get the form data
    console.log(values);
    setIsModalVisible(false);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
  };

  return (
    <>
      <Button onClick={showModal}>Refund...</Button>
      <Modal
        title=<>
          <Icon name="reply" style={{ marginRight: "8px" }} /> Refund Account
          Credit
        </>
        visible={isModalVisible}
        onOk={handleOk}
        onCancel={handleCancel}
        okText="Refund"
      >
        <Divider />
        <Form form={form}>
          <Form.Item name="amount" label={<div style={labelStyle}>Amount</div>}>
            <InputNumber style={{ width: "100%" }} min={0.01} />
          </Form.Item>
          <Form.Item name="reason" label={<div style={labelStyle}>Reason</div>}>
            <Select
              style={{ width: "100%" }}
              placeholder="Select Reason..."
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
            <Divider>What Happens</Divider>
            The above information is visible to the user. When you click OK,
            they will be refunded in 5-10 days, and their transactions log and
            statement will include a new "Refund" entry in CoCalc immediately
            (click Refresh to confirm). If they have an email address
            configured, they will also be sent an email. Stripe's fees for the
            original payment won't be returned, but there are no additional fees
            for the refund. This refund will use the latest Stripe-provided
            exchange rate, which may differ from the original rate.
          </div>
        </Form>
      </Modal>
    </>
  );
}

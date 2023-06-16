import { Button, InputNumber, Modal, Space, Tooltip, Statistic } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useEffect, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { currency } from "./quota-config";

export default function Payment({ balance, update }) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number | null>(
    Math.max(5, balance ?? 0)
  );
  const [minPayment, setMinPayment] = useState<number | undefined>(undefined);

  useEffect(() => {
    (async () => {
      setMinPayment(await webapp_client.purchases_client.getMinimumPayment());
    })();
  }, []);

  const showModal = () => {
    setPaymentAmount(Math.max(5, balance ?? 0));
    setIsModalVisible(true);
  };

  const handleOk = async () => {
    setIsModalVisible(false);
    setPaymentAmount(Math.max(5, balance ?? 0));
    if (!paymentAmount || paymentAmount < 0) {
      return;
    }
    await webapp_client.purchases_client.createCredit(paymentAmount);
    update();
  };

  const handleCancel = () => {
    setIsModalVisible(false);
  };

  return (
    <div>
      <Button disabled={balance == null} onClick={showModal}>
        <Icon name="credit-card" style={{ marginRight: "5px" }} />
        Make Payment...
      </Button>
      <Modal
        okText={"Create Invoice"}
        destroyOnClose
        maskClosable={false}
        zIndex={100000}
        title={
          <>
            <Icon name="credit-card" style={{ marginRight: "5px" }} /> Make
            Payment
          </>
        }
        open={balance != null && isModalVisible}
        onOk={handleOk}
        onCancel={handleCancel}
      >
        <div style={{ textAlign: "center" }}>
          <Statistic
            title={"Current balance (USD)"}
            value={balance}
            precision={2}
            prefix={"$"}
          />
        </div>
        <hr />
        <Space>
          <div style={{ marginRight: "30px" }}>
            Enter payment amount (USD):
            {minPayment != null && <div>Minimum: {currency(minPayment)}</div>}
          </div>
          <div>
            <InputNumber
              min={minPayment}
              max={100000} // maximum payment amount is $100,000
              precision={2} // for two decimal places
              step={0.01} // smallest possible increment is one cent
              value={paymentAmount}
              onChange={(value) => setPaymentAmount(value)}
            />
            <br />+ tax and fees
          </div>
          <Tooltip
            zIndex={9999999}
            title="If your payment exceeds your balance, then you will have a negative balance, which can be used for purchases beyond your global spend limit and to buy licenses in the store. Credits are nonrefundable, but do not expire."
          >
            <Icon name="question-circle" style={{ marginLeft: "10px" }} />
          </Tooltip>
        </Space>
        <hr />
        An invoice will be created, which you can pay using a wide range of
        methods. Once you pay the invoice, your account will be credited.
      </Modal>
    </div>
  );
}

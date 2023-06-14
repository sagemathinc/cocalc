import { Button, InputNumber, Modal, Space, Tooltip, Statistic } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useState } from "react";

export default function Payment({ balance }) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number | null>(0);

  const showModal = () => {
    setPaymentAmount(0);
    setIsModalVisible(true);
  };

  const handleOk = () => {
    setIsModalVisible(false);
    setPaymentAmount(0);
    if (!paymentAmount) {
      return;
    }
    const invoiceAmount = paymentAmount < 0 ? -paymentAmount : paymentAmount;
    console.log(`Creating invoice for ${invoiceAmount} USD...`);
    // Code here to create an invoice for the payment amount
    // Once the invoice is paid, the account balance can be updated
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
        <Statistic
          title={"Current balance (USD)"}
          value={balance}
          precision={2}
          prefix={"$"}
        />
        <Space>
          <div>Enter payment amount (USD):</div>
          <InputNumber
            min={2 /* TODO? */}
            max={100000} // maximum payment amount is $100,000
            precision={2} // for two decimal places
            step={0.01} // smallest possible increment is one cent
            defaultValue={0}
            value={paymentAmount}
            onChange={(value) => setPaymentAmount(value)}
          />

          <Tooltip title="You can pay more than the balance to create a negative balance, which can be used for pay-as-you-go purchases beyond your global limit or to buy licenses in the store without a credit card.">
            <Icon name="question-circle" style={{ marginLeft: "10px" }} />
          </Tooltip>
        </Space>
      </Modal>
    </div>
  );
}

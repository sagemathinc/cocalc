import {
  Button,
  Divider,
  InputNumber,
  Modal,
  Space,
  Tag,
  Tooltip,
  Statistic,
} from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useEffect, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { currency } from "./quota-config";
import { zIndex as zIndexPayAsGo } from "./pay-as-you-go/modal";
import { Support } from "./global-quota";
import { open_new_tab } from "@cocalc/frontend/misc/open-browser-tab";

const zIndex = zIndexPayAsGo + 1;
export const zIndexTip = zIndex + 1;

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
    const invoice = await webapp_client.purchases_client.createCredit(
      paymentAmount
    );
    if (invoice?.hosted_invoice_url) {
      open_new_tab(invoice.hosted_invoice_url, true);
    }
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
        zIndex={zIndex}
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
        <Divider plain orientation="left">
          Enter payment amount (in US dollars)
          <Tooltip
            zIndex={zIndexTip}
            title="If your payment exceeds your balance, then you will have a negative balance, which can be used for purchases that exceed your spending limit. Credits are nonrefundable, but do not expire."
          >
            <Icon name="question-circle" style={{ marginLeft: "30px" }} />
          </Tooltip>
        </Divider>
        <div style={{ textAlign: "center" }}>
          <div style={{ marginBottom: "15px" }}>
            {minPayment != null && (
              <Preset amount={minPayment} setPaymentAmount={setPaymentAmount}>
                Minimum: {currency(minPayment)}
              </Preset>
            )}
            {minPayment != null && balance >= minPayment && (
              <Preset amount={balance} setPaymentAmount={setPaymentAmount}>
                Balance: {currency(balance)}
              </Preset>
            )}
            <Preset amount={5} setPaymentAmount={setPaymentAmount}>
              $5
            </Preset>
            <Preset amount={20} setPaymentAmount={setPaymentAmount}>
              $20
            </Preset>
            <Preset amount={100} setPaymentAmount={setPaymentAmount}>
              $100
            </Preset>
          </div>
          <Space>
            <InputNumber
              min={minPayment}
              max={100000} // maximum payment amount is $100,000
              precision={2} // for two decimal places
              step={0.01} // smallest possible increment is one cent
              value={paymentAmount}
              onChange={(value) => setPaymentAmount(value)}
              addonAfter="$"
            />
            <div>+ tax and fees</div>
          </Space>
        </div>
        <Divider plain orientation="left">
          What Happens Next
        </Divider>
        An invoice will be created, which you can pay using a wide range of
        methods. Once you pay the invoice, your account will be credited. If
        things look wrong, <Support>contact support</Support>.
      </Modal>
    </div>
  );
}

export function Preset({ amount, setPaymentAmount, children }) {
  return (
    <Tag
      style={{ cursor: "pointer", marginBottom: "5px" }}
      color="blue"
      onClick={() => setPaymentAmount(amount)}
    >
      {children}
    </Tag>
  );
}

import { useEffect, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Button, Card, Modal, Space, Spin, Statistic } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { A } from "@cocalc/frontend/components/A";
import { plural } from "@cocalc/util/misc";
import Payment from "./payment";
import { currency } from "./quota-config";
import { zIndex as zIndexModal } from "./pay-as-you-go/modal";
import { Support } from "./global-quota";

const zIndex = zIndexModal + 1;

interface Props {
  balance?: number;
  refresh?: () => void;
}

export default function UnpaidInvoices({ balance, refresh }: Props) {
  const [isModalVisible, setIsModalVisible] = useState(isModalVisible);
  const [unpaidInvoices, setUnpaidInvoices] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  async function getUnpaidInvoices() {
    try {
      setRefreshing(true);
      const invoices = await webapp_client.purchases_client.getUnpaidInvoices();
      setUnpaidInvoices(invoices);
      if ((unpaidInvoices?.length ?? 0) > invoices.length) {
        // number of unpaid invoices just went down...
        await webapp_client.purchases_client.syncPaidInvoices();
        refresh?.();
      }
    } catch (err) {
      // nonfatal -- basically showing these is just a user convenience.
      console.warn("error getting unpaid invoices...", err);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    getUnpaidInvoices();
  }, []);

  if (unpaidInvoices == null) {
    return <Spin delay={1000} />;
  }

  if (unpaidInvoices.length == 0) {
    return (
      <div>
        <Payment balance={balance} update={getUnpaidInvoices} />
        <div style={{ marginTop: "5px" }}>You have no unpaid invoices.</div>
      </div>
    );
  }

  const handleClose = async () => {
    if (!isModalVisible) return;
    setIsModalVisible(false);
    await webapp_client.purchases_client.syncPaidInvoices();
    refresh?.();
  };

  const title = (
    <>
      <Icon name="shopping-cart" style={{ marginRight: "5px" }} />
      Pay {unpaidInvoices.length} Unpaid{" "}
      {plural(unpaidInvoices.length, "Invoice")}
    </>
  );

  return (
    <div>
      <Button
        size="large"
        danger
        type="primary"
        onClick={() => {
          setIsModalVisible(!isModalVisible);
        }}
      >
        {title}...
      </Button>
      <Modal
        zIndex={zIndex}
        okText="Done"
        title={
          <Space>
            {title}{" "}
            <Button disabled={refreshing} onClick={getUnpaidInvoices}>
              Refresh
              {refreshing && <Spin style={{ marginLeft: "15px" }} />}
            </Button>
          </Space>
        }
        open={isModalVisible}
        onOk={handleClose}
        onCancel={handleClose}
      >
        Click on each invoice below and pay it to complete your purchase. If
        anything looks wrong, <Support>contact support</Support>. Thanks!
        {unpaidInvoices.map((invoice) => (
          <Invoice key={invoice.id} invoice={invoice} />
        ))}
      </Modal>
    </div>
  );
}

function Invoice({ invoice }) {
  return (
    <Card style={{ margin: "5px 0" }}>
      <A href={invoice.hosted_invoice_url}>
        <Space>
          <Statistic
            style={{ width: "100px" }}
            title={"Amount (USD)"}
            value={invoice.amount_due / 100}
            precision={2}
            prefix={"$"}
          />
          <Description invoice={invoice} />
        </Space>
      </A>
    </Card>
  );
}

function Description({ invoice }) {
  const data = invoice.lines?.data;
  if (data == null || data.length == 0) return null;
  return data.map((x, n) => (
    <div key={n} style={{ width: "100%" }}>
      {n + 1}. {x.description} ... {currency(x.amount / 100)}
    </div>
  ));
}

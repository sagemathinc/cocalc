import { useEffect, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Button, Card, Divider, Modal, Space, Spin } from "antd";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { A } from "@cocalc/frontend/components/A";
import { plural } from "@cocalc/util/misc";
import Payment from "./payment";
import { currency } from "./quota-config";
import { zIndex as zIndexModal } from "./pay-as-you-go/modal";
import { Support } from "./global-quota";
import { open_new_tab } from "@cocalc/frontend/misc/open-browser-tab";

const zIndex = zIndexModal + 1;

interface Props {
  balance?: number;
  refresh?: () => void;
}

export default function UnpaidInvoices({ balance, refresh }: Props) {
  const [isModalVisible, setIsModalVisible] = useState(false);
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
        <Payment
          balance={balance}
          update={() => {
            getUnpaidInvoices();
            refresh?.();
          }}
        />
        <div style={{ marginTop: "15px", color: "#888" }}>
          You have no unpaid invoices.
        </div>
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
      {unpaidInvoices.length} Unpaid {plural(unpaidInvoices.length, "Invoice")}
    </>
  );

  return (
    <div>
      <Button.Group>
        <Button
          danger
          type="primary"
          onClick={() => {
            setIsModalVisible(!isModalVisible);
            getUnpaidInvoices();
          }}
        >
          {title}...
        </Button>
        <Button
          onClick={() => {
            getUnpaidInvoices();
          }}
        >
          <Icon name="refresh" /> Refresh
        </Button>
      </Button.Group>
      <Modal
        width={550}
        zIndex={zIndex}
        okText="Done"
        title={
          <Space>
            {title}{" "}
            <Button disabled={refreshing} onClick={getUnpaidInvoices}>
              <Icon name="refresh" /> Refresh
              {refreshing && <Spin style={{ marginLeft: "15px" }} />}
            </Button>
          </Space>
        }
        open={isModalVisible}
        onOk={handleClose}
        onCancel={handleClose}
      >
        Open each invoice below and pay it to complete your purchase. If
        anything looks wrong, <Support>contact support</Support>. Thanks!
        <Divider>Your Invoices</Divider>
        {unpaidInvoices.map((invoice) => (
          <Invoice key={invoice.id} invoice={invoice} />
        ))}
      </Modal>
    </div>
  );
}

function Invoice({ invoice }) {
  return (
    <Card
      hoverable
      style={{ margin: "15px 0" }}
      title={
        <div
          onClick={() => {
            open_new_tab(invoice.hosted_invoice_url, true);
          }}
        >
          <div style={{ float: "right" }}>
            <TimeAgo
              style={{ fontWeight: 300 }}
              date={invoice.created * 1000}
            />
          </div>
          {currency(invoice.amount_due / 100)}
        </div>
      }
    >
      <A href={invoice.hosted_invoice_url} style={{ fontSize: "12pt" }}>
        <Icon name="external-link" /> <Description invoice={invoice} />
      </A>
    </Card>
  );
}

function Description({ invoice }) {
  const data = invoice.lines?.data;
  if (data == null || data.length == 0) return null;
  return data.map((x, n) => (
    <div
      key={n}
      style={{
        width: "100%",
        display: data.length == 1 ? "inline" : undefined,
      }}
    >
      {data.length > 1 ? `${n + 1}. ` : ""} {x.description} ...{" "}
      {currency(x.amount / 100)}
    </div>
  ));
}

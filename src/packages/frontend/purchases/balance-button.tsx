import { Badge, Button, Spin } from "antd";
import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { CSS, useTypedRedux } from "@cocalc/frontend/app-framework";
import { NavTab } from "@cocalc/frontend/app/nav-tab";
import { NAV_CLASS } from "@cocalc/frontend/app/top-nav-consts";
import { labels } from "@cocalc/frontend/i18n";
import BalanceModal from "@cocalc/frontend/purchases/balance-modal";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { currency } from "@cocalc/util/misc";
import { moneyRound2Down } from "@cocalc/util/money";

export default function BalanceButton({
  style,
  onRefresh,
  minimal = false,
  topBar = false,
}: {
  style?;
  onRefresh?: () => void;
  minimal?: boolean;
  topBar?: boolean;
}) {
  const intl = useIntl();
  const is_commercial = useTypedRedux("customize", "is_commercial");
  const [open, setOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const dbBalance = useTypedRedux("account", "balance");
  const balanceAlert = useTypedRedux("account", "balance_alert");
  const [balance, setBalance] = useState<number | null>(dbBalance ?? null);
  const otherSettings = useTypedRedux("account", "other_settings");
  const hideNavbarBalance = otherSettings?.get("hide_navbar_balance");

  useEffect(() => {
    if (dbBalance != null) {
      setBalance(dbBalance);
    }
  }, [dbBalance]);

  const handleRefresh = async () => {
    if (!webapp_client.account_id) {
      // not signed in.
      return;
    }
    try {
      onRefresh?.();
      setLoading(true);
      await webapp_client.purchases_client.getBalance();
    } catch (err) {
      console.warn("Issue updating balance", err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    handleRefresh();
  }, []);

  function onClick() {
    handleRefresh();
    setOpen(!open);
  }

  function renderLabel() {
    return (
      <>
        {!minimal && <>{intl.formatMessage(labels.balance)}: </>}
        {balance != null
          ? currency(moneyRound2Down(balance).toNumber())
          : undefined}
        {balanceAlert && (
          <Badge
            count={1}
            size="small"
            style={{ backgroundColor: "#688ff1", marginLeft: "5px" }}
          />
        )}
        {!minimal && loading && <Spin style={{ marginLeft: "5px" }} />}
      </>
    );
  }

  const displayStyle: CSS = {
    ...style,
    ...(balanceAlert
      ? { backgroundColor: "red", color: "white", marginRight: "5px" }
      : undefined),
  };

  function renderButton() {
    return (
      <Button
        size={minimal ? "small" : undefined}
        type={"text"}
        style={displayStyle}
        onClick={onClick}
      >
        {renderLabel()}
      </Button>
    );
  }

  function renderDisplay() {
    if (topBar) {
      return (
        <NavTab
          name={undefined} // never opens a tab
          active_top_tab={"balance"} // never active
          label={renderLabel()}
          label_class={NAV_CLASS}
          on_click={onClick}
          hide_label={false}
          add_inner_style={displayStyle}
        />
      );
    } else {
      return renderButton();
    }
  }

  function renderModal() {
    if (!open) return;

    return (
      <BalanceModal onRefresh={handleRefresh} onClose={() => setOpen(false)} />
    );
  }

  // This ensures it only shows up in commercial setups.
  // Wherever it is used, the component shouldn't be instantiated in those cases, though.
  if (!is_commercial || (topBar && hideNavbarBalance && !balanceAlert)) {
    return;
  } else {
    return (
      <>
        {renderDisplay()}
        {renderModal()}
      </>
    );
  }
}

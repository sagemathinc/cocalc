/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  Alert,
  Button,
  Card,
  Flex,
  Divider,
  Modal,
  Radio,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import { useEffect, useMemo, useRef, useState } from "react";

import api from "@cocalc/frontend/client/api";
import { Icon } from "@cocalc/frontend/components";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import StripePayment from "@cocalc/frontend/purchases/stripe-payment";
import Payments from "@cocalc/frontend/purchases/payments";
import {
  applyMembershipChange,
  getMembershipChangeQuote,
  type MembershipChangeQuote,
} from "@cocalc/frontend/purchases/api";
import { MEMBERSHIP_CHANGE } from "@cocalc/util/db-schema/purchases";
import { currency } from "@cocalc/util/misc";
import {
  moneyRound2Up,
  moneyToCurrency,
  toDecimal,
  type MoneyValue,
} from "@cocalc/util/money";
import type { LineItem } from "@cocalc/util/stripe/types";
import type { MembershipResolution } from "@cocalc/conat/hub/api/purchases";

const { Text, Title } = Typography;

interface MembershipTier {
  id: string;
  label?: string;
  store_visible?: boolean;
  priority?: number;
  price_monthly?: MoneyValue;
  price_yearly?: MoneyValue;
  disabled?: boolean;
}

interface MembershipTiersResponse {
  tiers?: MembershipTier[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

export default function MembershipPurchaseModal({
  open,
  onClose,
  onChanged,
}: Props) {
  const [membership, setMembership] = useState<MembershipResolution | null>(null);
  const [tiers, setTiers] = useState<MembershipTier[]>([]);
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [quote, setQuote] = useState<MembershipChangeQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState<boolean>(false);
  const [quoteError, setQuoteError] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [place, setPlace] = useState<"checkout" | "processing" | "done">(
    "checkout",
  );
  const numPaymentsRef = useRef<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [membershipResult, tiersResult] = await Promise.all([
        api("purchases/get-membership"),
        api("purchases/get-membership-tiers"),
      ]);
      setMembership(membershipResult as MembershipResolution);
      setTiers((tiersResult as MembershipTiersResponse)?.tiers ?? []);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setSelectedTierId(null);
    setQuote(null);
    setQuoteError("");
    setPlace("checkout");
    load();
  }, [open]);

  const visibleTiers = useMemo(() => {
    return tiers
      .filter((tier) => tier.store_visible && !tier.disabled)
      .sort((a, b) => {
        const ap = a.priority ?? 0;
        const bp = b.priority ?? 0;
        if (ap !== bp) return ap - bp;
        const al = a.label ?? a.id;
        const bl = b.label ?? b.id;
        return al.localeCompare(bl);
      });
  }, [tiers]);

  const tierById = useMemo(() => {
    return visibleTiers.reduce((acc, tier) => {
      acc[tier.id] = tier;
      return acc;
    }, {} as Record<string, MembershipTier>);
  }, [visibleTiers]);

  useEffect(() => {
    if (!open || !selectedTierId) return;
    const loadQuote = async () => {
      setQuote(null);
      setQuoteError("");
      setQuoteLoading(true);
      try {
        const result = await getMembershipChangeQuote({
          class: selectedTierId,
          interval,
          allow_downgrade: true,
        });
        setQuote(result);
      } catch (err) {
        setQuoteError(`${err}`);
      } finally {
        setQuoteLoading(false);
      }
    };
    loadQuote();
  }, [open, selectedTierId, interval]);

  const currentClass = membership?.class ?? "free";
  const selectedTier = selectedTierId ? tierById[selectedTierId] : undefined;
  const selectedLabel = selectedTier?.label ?? selectedTier?.id ?? "";

  const quoteChargeValue = toDecimal(quote?.charge ?? 0);
  const rawChargeAmount =
    quote?.charge_amount ??
    (quote as { chargeAmount?: number } | null)?.chargeAmount;
  const chargeAmountValue =
    rawChargeAmount != null ? toDecimal(rawChargeAmount) : quoteChargeValue;
  const paymentRequired =
    quote?.allowed === false &&
    rawChargeAmount != null &&
    chargeAmountValue.gt(0);
  const refundValue = toDecimal(quote?.refund ?? 0);

  const lineItems: LineItem[] = [];
  if (quote && quoteChargeValue.gt(0)) {
    lineItems.push({
      description: `${selectedLabel} membership (${interval})`,
      amount: moneyRound2Up(quoteChargeValue).toNumber(),
    });
    if (chargeAmountValue.lt(quoteChargeValue)) {
      lineItems.push({
        description: "Apply account balance toward membership change",
        amount: chargeAmountValue.sub(quoteChargeValue).toNumber(),
      });
    }
  }

  const changeLabel =
    quote?.change === "upgrade"
      ? "Upgrade"
      : quote?.change === "downgrade"
        ? "Downgrade"
        : "Start";
  const canProceed = quote?.allowed !== false || paymentRequired;

  const isCurrent = selectedTierId != null && selectedTierId === currentClass;

  const directChange = async () => {
    if (!selectedTierId) return;
    setActionLoading(true);
    setQuoteError("");
    try {
      await applyMembershipChange({
        class: selectedTierId,
        interval,
        allow_downgrade: true,
      });
      setPlace("done");
      await load();
      onChanged?.();
    } catch (err) {
      setQuoteError(`${err}`);
    } finally {
      setActionLoading(false);
    }
  };

  const refreshStatus = async () => {
    await load();
    onChanged?.();
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={onClose}
      width={900}
      title={
        <Flex align="center" gap="small">
          <Icon name="user" />
          <Title level={4} style={{ margin: 0 }}>
            Change Membership
          </Title>
        </Flex>
      }
    >
      {loading && (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <Spin />
        </div>
      )}
      {error && <Alert type="error" message={error} />}
      {!loading && !error && (
        <>
          <div style={{ marginBottom: "12px" }}>
            <Text type="secondary">
              Current membership:{" "}
              <Tag color={currentClass === "free" ? "default" : "blue"}>
                {currentClass}
              </Tag>
            </Text>
          </div>
          <div style={{ marginBottom: "16px" }}>
            <Radio.Group
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="month">Monthly</Radio.Button>
              <Radio.Button value="year">Yearly</Radio.Button>
            </Radio.Group>
          </div>
          <Flex gap="large" wrap={false} style={{ overflowX: "auto" }}>
            {visibleTiers.length === 0 && (
              <Alert
                type="info"
                message="No membership tiers are currently available."
              />
            )}
            {visibleTiers.map((tier) => {
              const price =
                interval === "month" ? tier.price_monthly : tier.price_yearly;
              const priceValue = price != null ? toDecimal(price) : null;
              const isCurrentTier = tier.id === currentClass;
              const tierPriority = tier.priority ?? 0;
              const currentPriority =
                tierById[currentClass]?.priority ?? 0;
              const actionLabel = isCurrentTier
                ? "Current plan"
                : tierPriority > currentPriority
                  ? `Upgrade to ${tier.label ?? tier.id}`
                  : `Downgrade to ${tier.label ?? tier.id}`;
              return (
                <Card
                  key={tier.id}
                  style={{
                    minWidth: "260px",
                    flex: "1 1 0",
                    borderColor:
                      selectedTierId === tier.id ? "#1677ff" : undefined,
                  }}
                >
                  <Title level={4}>{tier.label ?? tier.id}</Title>
                  <div style={{ marginBottom: "8px" }}>
                    {priceValue != null ? (
                      <Text strong>{moneyToCurrency(priceValue)}</Text>
                    ) : (
                      <Text type="secondary">Pricing not configured</Text>
                    )}{" "}
                    <Text type="secondary">/ {interval}</Text>
                  </div>
                  <Button
                    type={selectedTierId === tier.id ? "primary" : "default"}
                    disabled={isCurrentTier || priceValue == null}
                    onClick={() => {
                      if (!isCurrentTier) {
                        setSelectedTierId(tier.id);
                        setPlace("checkout");
                      }
                    }}
                  >
                    {actionLabel}
                  </Button>
                </Card>
              );
            })}
          </Flex>
        </>
      )}

      {selectedTierId && !isCurrent && (
        <div style={{ marginTop: "20px" }}>
          <Divider />
          {quoteLoading && <Spin />}
          {quoteError && <Alert type="error" message={quoteError} />}
          {quote && quote.allowed === false && quote.reason && (
            <Alert
              type={paymentRequired ? "warning" : "error"}
              message={quote.reason}
            />
          )}
          {quote && place === "checkout" && (
            <div>
              <div style={{ marginBottom: "12px" }}>
                <Text strong>
                  {changeLabel} to {selectedLabel} ({interval})
                </Text>
              </div>
              {refundValue.gt(0) && (
                <Alert
                  type="info"
                  message={`Prorated credit applied: ${currency(
                    moneyRound2Up(refundValue).toNumber(),
                  )}`}
                />
              )}
              {quote.change === "downgrade" && quote.current_period_end && (
                <Alert
                  type="info"
                  message={
                    <span>
                      Downgrades take effect immediately. Current period ends{" "}
                      <TimeAgo date={quote.current_period_end} />.
                    </span>
                  }
                />
              )}
              {canProceed &&
                quoteChargeValue.gt(0) &&
                chargeAmountValue.gt(0) && (
                <div style={{ marginTop: "12px" }}>
                  <StripePayment
                    disabled={actionLoading}
                    lineItems={lineItems}
                    description={`Membership change to ${selectedLabel} (${interval})`}
                    purpose={MEMBERSHIP_CHANGE}
                    metadata={{
                      membership_class: selectedTierId,
                      membership_interval: interval,
                      allow_downgrade: "true",
                    }}
                    onFinished={async (total) => {
                      if (!total) {
                        await directChange();
                      } else {
                        setPlace("processing");
                      }
                    }}
                  />
                </div>
              )}
              {canProceed &&
                (quoteChargeValue.eq(0) || chargeAmountValue.eq(0)) && (
                <div style={{ marginTop: "12px" }}>
                  <Space>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button
                      type="primary"
                      loading={actionLoading}
                      onClick={directChange}
                    >
                      Confirm change
                    </Button>
                  </Space>
                </div>
              )}
            </div>
          )}
          {place === "processing" && (
            <div>
              <Alert
                type="info"
                message="Payment is processing. Your membership will update once the payment completes."
                style={{ marginBottom: "12px" }}
              />
              <Payments
                purpose={MEMBERSHIP_CHANGE}
                numPaymentsRef={numPaymentsRef}
                limit={5}
              />
              <div style={{ marginTop: "12px" }}>
                <Space>
                  <Button onClick={refreshStatus}>Refresh membership</Button>
                  <Button type="primary" onClick={onClose}>
                    Close
                  </Button>
                </Space>
              </div>
            </div>
          )}
          {place === "done" && (
            <Alert
              type="success"
              message="Membership updated."
              style={{ marginTop: "12px" }}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

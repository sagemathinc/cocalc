/*
 *  Membership store page.
 */

import { Alert, Button, Card, Flex, Radio, Typography } from "antd";
import { useMemo, useState } from "react";
import { useRouter } from "next/router";

import { Icon } from "@cocalc/frontend/components/icon";
import { currency } from "@cocalc/util/misc";
import Loading from "components/share/loading";
import SiteName from "components/share/site-name";
import apiPost from "lib/api/post";
import useAPI from "lib/hooks/api";

const { Paragraph, Title, Text } = Typography;

type Interval = "month" | "year";

interface TierPricing {
  price_monthly?: number;
  price_yearly?: number;
}

interface MembershipTiersResponse {
  tiers?: (TierPricing & {
    id: string;
    label?: string;
    store_visible?: boolean;
    priority?: number;
    disabled?: boolean;
  })[];
}

interface MembershipStatus {
  class: string;
}

type MembershipTier = NonNullable<MembershipTiersResponse["tiers"]>[number];

export default function Memberships() {
  const router = useRouter();
  const [interval, setInterval] = useState<Interval>("month");
  const [error, setError] = useState<string>("");
  const tiers = useAPI("/purchases/get-membership-tiers");
  const membership = useAPI("/purchases/get-membership");
  const tierConfig = tiers.result as MembershipTiersResponse | undefined;
  const status = membership.result as MembershipStatus | undefined;

  const currentClass = status?.class ?? "free";
  const tiersList = tierConfig?.tiers ?? [];
  const tierById = useMemo(
    () =>
      tiersList.reduce((acc, tier) => {
        acc[tier.id] = tier;
        return acc;
      }, {} as Record<string, MembershipTier>),
    [tiersList],
  );
  const currentTier = tierById[currentClass];
  const currentPriority = currentTier?.priority ?? 0;

  const visibleTiers = useMemo(
    () =>
      tiersList
        .filter((tier) => tier.store_visible && !tier.disabled)
        .sort((a, b) => {
          const ap = a.priority ?? 0;
          const bp = b.priority ?? 0;
          if (bp != ap) return bp - ap;
          const al = a.label ?? a.id;
          const bl = b.label ?? b.id;
          return al.localeCompare(bl);
        }),
    [tiersList],
  );

  const priceFor = (tier: MembershipTier, ivl: Interval): number | null => {
    const price = ivl == "month" ? tier.price_monthly : tier.price_yearly;
    return price ?? null;
  };

  const addToCart = async (tier: MembershipTier) => {
    const price = priceFor(tier, interval);
    if (price == null) {
      throw Error(`Price not configured for ${tier.id} (${interval}).`);
    }
    setError("");
    try {
      await apiPost("/shopping/cart/add", {
        product: "membership",
        description: {
          type: "membership",
          class: tier.id,
          interval,
          price,
        },
      });
      router.push("/store/cart");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  };

  const membershipCards = visibleTiers.map((tier) => {
    const tierPriority = tier.priority ?? 0;
    const isCurrent = tier.id === currentClass;
    const isUpgrade = tierPriority > currentPriority && currentPriority > 0;
    const canPurchase =
      !isCurrent && (tierPriority > currentPriority || currentClass == "free");
    return {
      tier,
      title: tier.label ?? tier.id,
      price: priceFor(tier, interval),
      disabled: !canPurchase,
      upgrading: tierPriority > currentPriority && currentPriority > 0,
      actionLabel: isCurrent
        ? "Current Plan"
        : isUpgrade
          ? `Upgrade to ${tier.label ?? tier.id}`
          : "Add to Cart",
    };
  });

  if (tiers.error) {
    return <Alert type="error" message={tiers.error} />;
  }
  if (membership.error) {
    return <Alert type="error" message={membership.error} />;
  }
  if (!tiers.result || !membership.result) {
    return <Loading large center />;
  }

  return (
    <div>
      <Flex align="center" gap="middle" style={{ marginBottom: "20px" }}>
        <Icon name="user" style={{ fontSize: "26px" }} />
        <Title level={2} style={{ margin: 0 }}>
          Memberships
        </Title>
      </Flex>
      <Paragraph>
        Choose a <SiteName /> membership. Student memberships are purchased
        elsewhere.
      </Paragraph>
      {error && (
        <Alert
          type="error"
          message={error}
          style={{ marginBottom: "15px" }}
        />
      )}
      <div style={{ marginBottom: "20px" }}>
        <Radio.Group
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="month">Monthly</Radio.Button>
          <Radio.Button value="year">Yearly (discounted)</Radio.Button>
        </Radio.Group>
      </div>
      <Flex gap="large" wrap="wrap">
        {membershipCards.length == 0 && (
          <Alert
            type="info"
            message="No membership tiers are currently available in the store."
          />
        )}
        {membershipCards.map((card) => (
          <Card
            key={card.tier.id}
            style={{ minWidth: "260px", flex: "1 1 320px" }}
            bordered
          >
            <Title level={3}>{card.title}</Title>
            <Paragraph>
              {card.price != null ? (
                <>
                  <Text strong>{currency(card.price)}</Text> / {interval}
                </>
              ) : (
                <Text type="secondary">Pricing not configured</Text>
              )}
            </Paragraph>
            {card.upgrading ? (
              <Paragraph type="secondary">
                Prorated credit applied at checkout.
              </Paragraph>
            ) : null}
            <Button
              type="primary"
              disabled={card.disabled || card.price == null}
              onClick={() => addToCart(card.tier)}
            >
              {card.actionLabel}
            </Button>
          </Card>
        ))}
      </Flex>
    </div>
  );
}

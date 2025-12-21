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
type TierClass = "member" | "pro";

interface TierPricing {
  price_monthly?: number;
  price_yearly?: number;
}

interface MembershipTiersResponse {
  tiers?: Record<string, TierPricing>;
}

interface MembershipStatus {
  class: "free" | "student" | "member" | "pro";
}

export default function Memberships() {
  const router = useRouter();
  const [interval, setInterval] = useState<Interval>("month");
  const [error, setError] = useState<string>("");
  const tiers = useAPI("/purchases/get-membership-tiers");
  const membership = useAPI("/purchases/get-membership");
  const tierConfig = tiers.result as MembershipTiersResponse | undefined;
  const status = membership.result as MembershipStatus | undefined;

  const currentClass = status?.class ?? "free";

  const priceFor = (tier: TierClass, ivl: Interval): number | null => {
    const t = tierConfig?.tiers?.[tier];
    const price = ivl == "month" ? t?.price_monthly : t?.price_yearly;
    return price ?? null;
  };

  const memberPrice = priceFor("member", interval);
  const proPrice = priceFor("pro", interval);

  const canBuyMember = currentClass == "free" || currentClass == "student";
  const canBuyPro = currentClass != "pro";
  const upgrading = currentClass == "member";

  const addToCart = async (tier: TierClass) => {
    const price = priceFor(tier, interval);
    if (price == null) {
      throw Error(`Price not configured for ${tier} (${interval}).`);
    }
    setError("");
    try {
      await apiPost("/shopping/cart/add", {
        product: "membership",
        description: {
          type: "membership",
          class: tier,
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

  const membershipCards = [
    {
      tier: "member" as TierClass,
      title: "Member",
      price: memberPrice,
      disabled: !canBuyMember,
      actionLabel: currentClass == "member" ? "Current Plan" : "Add to Cart",
    },
    {
      tier: "pro" as TierClass,
      title: "Pro",
      price: proPrice,
      disabled: !canBuyPro,
      actionLabel:
        currentClass == "pro"
          ? "Current Plan"
          : currentClass == "member"
            ? "Upgrade to Pro"
            : "Add to Cart",
    },
  ];

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
        {membershipCards.map((card) => (
          <Card
            key={card.tier}
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
            {upgrading && card.tier == "pro" ? (
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

/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Modal, Space, Spin, Tag, Typography } from "antd";
import { type ReactElement, useEffect, useMemo, useState } from "react";

import api from "@cocalc/frontend/client/api";
import { useAsyncEffect, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { capitalize } from "@cocalc/util/misc";
import type { MembershipResolution } from "@cocalc/conat/hub/api/purchases";
import { MembershipStatusPanel } from "./membership-status";

const { Text } = Typography;

interface MembershipTier {
  id: string;
  label?: string;
}

interface MembershipTiersResponse {
  tiers?: MembershipTier[];
}

export default function MembershipBadge(): ReactElement | null {
  const account_id = useTypedRedux("account", "account_id");
  const is_anonymous = useTypedRedux("account", "is_anonymous");
  const is_commercial = useTypedRedux("customize", "is_commercial");
  const [open, setOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [refreshToken, setRefreshToken] = useState<number>(0);
  const [membership, setMembership] = useState<MembershipResolution | null>(null);
  const [tiers, setTiers] = useState<MembershipTier[]>([]);

  useAsyncEffect(async (isMounted) => {
    if (!account_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [membershipResult, tiersResult] = await Promise.all([
        api("purchases/get-membership"),
        api("purchases/get-membership-tiers"),
      ]);
      if (!isMounted()) return;
      setMembership(membershipResult as MembershipResolution);
      setTiers((tiersResult as MembershipTiersResponse)?.tiers ?? []);
    } catch (err) {
      if (!isMounted()) return;
      console.warn("Issue loading membership badge data", err);
      setError(`${err}`);
    } finally {
      if (isMounted()) {
        setLoading(false);
      }
    }
  }, [account_id, refreshToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setRefreshToken((value) => value + 1);
    window.addEventListener("cocalc:membership-changed", handler);
    return () => {
      window.removeEventListener("cocalc:membership-changed", handler);
    };
  }, []);

  const tierById = useMemo(() => {
    return tiers.reduce((acc, tier) => {
      acc[tier.id] = tier;
      return acc;
    }, {} as Record<string, MembershipTier>);
  }, [tiers]);

  if (!is_commercial || !account_id || is_anonymous) {
    return null;
  }

  const membershipClass = membership?.class;
  const tierLabel =
    membershipClass != null
      ? tierById[membershipClass]?.label ?? capitalize(membershipClass)
      : undefined;
  const tagLabel = error
    ? "Unavailable"
    : loading && !membership
      ? "Loading..."
      : tierLabel ?? "Free";
  const tagColor = membershipClass === "free" ? "default" : "blue";

  return (
    <>
      <Button type="text" onClick={() => setOpen(true)}>
        <Space size={6}>
          <Icon name="user" />
          <Text type="secondary">Membership:</Text>
          <Tag color={tagColor} style={{ marginInlineEnd: 0 }}>
            {tagLabel}
          </Tag>
          {loading && <Spin size="small" />}
        </Space>
      </Button>
      {open && (
        <Modal
          width={800}
          title="Membership"
          open
          onCancel={() => setOpen(false)}
          onOk={() => setOpen(false)}
        >
          <MembershipStatusPanel showHeader={false} />
        </Modal>
      )}
    </>
  );
}

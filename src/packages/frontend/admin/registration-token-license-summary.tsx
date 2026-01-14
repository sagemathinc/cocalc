/*
 *  This file is part of CoCalc: Copyright © 2020-2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useEffect, useState } from "react";

import {
  site_license_public_info,
  trunc_license_id,
} from "@cocalc/frontend/site-licenses/util";
import { describe_quota } from "@cocalc/util/licenses/describe-quota";

interface Props {
  licenseId?: string;
}

export default function LicenseSummary({ licenseId }: Props) {
  const [summary, setSummary] = useState<string>("None");

  useEffect(() => {
    let isMounted = true;
    if (!licenseId) {
      setSummary("None");
      return;
    }
    setSummary("Loading...");
    (async () => {
      try {
        const info = await site_license_public_info(licenseId);
        if (!isMounted) return;
        if (!info) {
          setSummary(`${trunc_license_id(licenseId)} (not found)`);
          return;
        }
        const parts: string[] = [];
        if (info.title) parts.push(info.title);
        if (info.description) parts.push(info.description);
        if (info.quota) {
          const quotaDesc = describe_quota(info.quota);
          if (quotaDesc) parts.push(quotaDesc);
        }
        const text = parts.filter(Boolean).join(" — ");
        setSummary(text || trunc_license_id(licenseId));
      } catch (err) {
        if (isMounted) {
          setSummary(`${trunc_license_id(licenseId)} (error loading)`);
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [licenseId]);

  if (!licenseId) return <span>None</span>;
  return <span title={licenseId}>{summary}</span>;
}

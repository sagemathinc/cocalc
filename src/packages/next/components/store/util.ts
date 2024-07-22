/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  delete_local_storage,
  get_local_storage,
  set_local_storage,
} from "@cocalc/frontend/misc/local-storage";
import { ONE_DAY_MS } from "@cocalc/util/consts/billing";
import { isValidUUID } from "@cocalc/util/misc";
import { endOfDay, getDays, startOfDay } from "@cocalc/util/stripe/timecalcs";
import { DateRange } from "@cocalc/util/upgrades/shopping";
import useCustomize from "lib/use-customize";
import dayjs from "dayjs";
import { NextRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { LicenseTypeInForms } from "./add-to-cart";

// site license type in a form, we have 4 forms hence 4 types
// later, this will be mapped to just "LicenseType", where boost and regular
// are "quota" and item.boost = true|false.
export function getType(item): LicenseTypeInForms {
  const descr = item.description;
  if (descr.dedicated_disk != null && descr.dedicated_disk !== false) {
    return "disk";
  } else if (descr.dedicated_vm != null && descr.dedicated_vm !== false) {
    return "vm";
  } else if (descr.boost === true) {
    return "boost";
  } else {
    return "regular";
  }
}

// when loading an item from the cart/saved for later, we have to fix the start/end dates to be at least "today" at the start of the day in the users time zone.
export function loadDateRange(range?: DateRange): DateRange {
  if (range == null) {
    const now = new Date();
    return [startOfDay(now), endOfDay(now)];
  }

  for (const idx of [0, 1]) {
    const v = range[idx];
    if (typeof v === "string") {
      range[idx] = new Date(v);
    }
  }

  if (range[0] instanceof Date) {
    const today = startOfDay(new Date());
    const prevStart = range[0];

    if (range[0].getTime() < today.getTime()) {
      range[0] = today;
    }

    // we we have to shift the start, move the end forward as well and preserve the duration.
    if (range[1] instanceof Date) {
      if (range[0].getTime() > range[1].getTime()) {
        const days = getDays({ start: prevStart, end: range[1] });
        range[1] = endOfDay(new Date(Date.now() + ONE_DAY_MS * days));
      }
    }
  }
  return range;
}

/**
 * use serverTime to fix the users exact time and return an object with these properties:
 * - offset: difference in milliseconds between server time and user time
 * - timezone: the user's timezone
 * - serverTime: the Date object of serverTime
 * - userTime: the Date object of userTime
 * - function toServerTime(date): converts a Date object from the user's time to the server time
 *
 * @param serverTime -- milliseconds since epoch from the server
 */
export function useTimeFixer() {
  const { serverTime: customizeServerTime } = useCustomize();

  return useMemo(() => {
    // server time is supposed to be always set, but just in case …
    if (customizeServerTime == null) {
      console.warn(
        "WARNING: customize.serverTime is not set, using Date.now()"
      );
    }
    const serverTime = customizeServerTime ?? Date.now();
    const localTime = Date.now();

    // important: useMemo, b/c we calculate the offset only *once* when the page loads, not each time the hook is called
    const offset = localTime - serverTime;

    function toTimestamp(date: Date | string): number {
      return dayjs(date).toDate().getTime();
    }

    function toServerTime(date: Date | string) {
      return new Date(toTimestamp(date) - offset);
    }

    function fromServerTime(date: Date | string) {
      return new Date(toTimestamp(date) + offset);
    }

    return {
      offset,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      serverTimeDate: new Date(serverTime),
      toServerTime,
      fromServerTime,
    };
  }, []);
}

export const LS_KEY_LICENSE_PROJECT = "store_site_license_project_id";
const LS_KEY_LICENSE_ASSOCIATION = "store_site_license_association";

/**
 * We want to make it possible to purchase a license and applying it automatically to a project.
 * For that, we check if there is a query param "project_id" (and save it in local storage) or just check local storage.
 */
export function useLicenseProject(router: NextRouter) {
  const [upgradeProjectId, setUpgradeProjectId] = useState<
    string | undefined
  >();

  useEffect(() => {
    const { project_id } = router.query;
    const projectIdLS = get_local_storage(LS_KEY_LICENSE_PROJECT);

    if (typeof project_id === "string" && isValidUUID(project_id)) {
      setUpgradeProjectId(project_id);
      set_local_storage(LS_KEY_LICENSE_PROJECT, project_id);
    } else if (typeof projectIdLS === "string" && isValidUUID(projectIdLS)) {
      setUpgradeProjectId(projectIdLS);
    } else {
      if (project_id != null) {
        console.warn(`Invalid ?project_id=... query param: '${project_id}'`);
      }
    }
  }, []);

  // this removes the project_id from local storage and the query param
  function upgradeProjectDelete() {
    delete_local_storage(LS_KEY_LICENSE_PROJECT);
    setUpgradeProjectId(undefined);
    const { pathname } = router;
    const query = router.query;
    delete query.project_id;
    router.replace({ pathname, query }, undefined, { shallow: true });
  }

  // the ID created in the shopping cart, not the actual ID!
  // when this is called, we kind of "consume" the project_id
  // and remove it from the query param and local storage
  function storeLicenseProjectAssociation(id: number) {
    const project_id = get_local_storage(LS_KEY_LICENSE_PROJECT);
    if (typeof project_id !== "string" || !isValidUUID(project_id)) {
      console.warn(`Invalid project_id in local storage: '${project_id}'`);
    }
    set_local_storage(LS_KEY_LICENSE_ASSOCIATION, `${id}::${project_id}`);
    upgradeProjectDelete();
  }

  return {
    upgradeProjectId,
    upgradeProjectDelete,
    storeLicenseProjectAssociation,
  };
}

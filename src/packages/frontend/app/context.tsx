/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { theme, ThemeConfig } from "antd";
import { debounce } from "lodash";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useIntl } from "react-intl";

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { IntlMessage, isIntlMessage } from "@cocalc/frontend/i18n";
import { ACTIVITY_BAR_LABELS } from "@cocalc/frontend/project/page/activity-bar-consts";
import { COLORS } from "@cocalc/util/theme";
import { NARROW_THRESHOLD_PX, PageStyle } from "./top-nav-consts";
import useAppContext, { AppContext, AppState, calcStyle } from "./use-context";

export { AppContext, useAppContext };

export function useAppContextProvider(): AppState {
  const intl = useIntl();
  const other_settings = useTypedRedux("account", "other_settings");
  const showActBarLabels = other_settings.get(ACTIVITY_BAR_LABELS) ?? true;

  const [pageWidthPx, setPageWidthPx] = useState<number>(window.innerWidth);

  const [narrow, setNarrow] = useState<boolean>(isNarrow());

  function update() {
    setNarrow(isNarrow());
    if (window.innerWidth != pageWidthPx) {
      setPageWidthPx(window.innerWidth);
    }
  }

  useEffect(() => {
    const handleResize = debounce(update, 50, {
      leading: false,
      trailing: true,
    });

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // avoid updating the style on every resize event
  const pageStyle: PageStyle = useMemo(() => {
    return calcStyle(narrow);
  }, [narrow]);

  function formatIntl(
    msg: IntlMessage | ReactNode | string,
  ): ReactNode | string {
    if (isIntlMessage(msg)) {
      return intl.formatMessage(msg);
    } else {
      return msg;
    }
  }

  return {
    formatIntl,
    pageWidthPx,
    pageStyle,
    showActBarLabels,
  };
}

export function useAntdStyleProvider() {
  const other_settings = useTypedRedux("account", "other_settings");
  const rounded = other_settings?.get("antd_rounded", true);
  const animate = other_settings?.get("antd_animate", true);
  const branded = other_settings?.get("antd_brandcolors", false);
  const compact = other_settings?.get("antd_compact", false);

  const borderStyle = rounded
    ? undefined
    : { borderRadius: 0, borderRadiusLG: 0, borderRadiusSM: 0 };

  const animationStyle = animate ? undefined : { motion: false };

  const brandedColors = branded
    ? { colorPrimary: COLORS.COCALC_BLUE }
    : undefined;

  const algorithm = compact ? { algorithm: theme.compactAlgorithm } : undefined;

  const antdTheme: ThemeConfig = {
    ...algorithm,
    token: {
      ...brandedColors,
      ...borderStyle,
      ...animationStyle,
    },
    components: {
      Button: {
        ...brandedColors,
      },
    },
  };

  return {
    antdTheme,
  };
}

function isNarrow(): boolean {
  return window.innerWidth != null && window.innerWidth <= NARROW_THRESHOLD_PX;
}

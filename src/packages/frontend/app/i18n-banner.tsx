/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import { useIntl } from "react-intl";

import {
  I18N_MESSAGE,
  I18N_TITLE,
  I18NSelector,
} from "@cocalc/frontend/account/i18n-selector";
import {
  CSS,
  React,
  redux,
  useAsyncEffect,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { useLocalizationCtx } from "@cocalc/frontend/app/localize";
import {
  CloseX2,
  HelpIcon,
  HiddenXSSM,
  Icon,
  Text,
} from "@cocalc/frontend/components";
import { SiteName } from "@cocalc/frontend/customize";
import {
  DEFAULT_LOCALE,
  OTHER_SETTINGS_LOCALE_KEY,
} from "@cocalc/frontend/i18n";
import { once } from "@cocalc/util/async-utils";
import { KEEP_EN_LOCALE } from "@cocalc/util/consts/locale";
import { COLORS } from "@cocalc/util/theme";

// no need to translate this message, since it only shows up when there is no locale set
export const I18N_HINT_ACCOUNT_SETTINGS = `You can also change the language in your "Account" settings.`;

const I18N_BANNER_STYLE: CSS = {
  width: "100%",
  padding: "5px",
  borderBottom: `1px solid ${COLORS.GRAY_D}`,
  background: COLORS.BS_GREEN_LL,
} as const;

export function useShowI18NBanner() {
  const other_settings = useTypedRedux("account", "other_settings");
  const i18n = other_settings?.get(OTHER_SETTINGS_LOCALE_KEY);

  return useMemo(() => {
    // we show the banner, if the default locale is set and the browser langauge is not english
    // user's can dismiss this, which sets the locale to "en-keep".
    if (i18n === DEFAULT_LOCALE) {
      if (!navigator.language.toLowerCase().startsWith("en")) {
        return true;
      }
    }
  }, [i18n]);
}

export const I18NBanner: React.FC<{}> = () => {
  const intl = useIntl();
  const { setLocale } = useLocalizationCtx();

  const [loaded, setLoaded] = useState<boolean>(false);

  // wait until the account settings are loaded to show the banner
  useAsyncEffect(async () => {
    const store = redux.getStore("account");
    if (!store.get("is_ready")) {
      await once(store, "is_ready");
    }
    setLoaded(true);
  }, []);

  function keep_english() {
    redux
      .getActions("account")
      .set_other_settings(OTHER_SETTINGS_LOCALE_KEY, KEEP_EN_LOCALE);
    setLocale(KEEP_EN_LOCALE);
  }

  if (!loaded) return;

  return (
    <div
      role="region"
      aria-label="Language selection"
      aria-live="polite"
      style={I18N_BANNER_STYLE}
    >
      <Text strong>
        <Icon name={"translation-outlined"} /> Use <SiteName /> in a different
        language:
      </Text>{" "}
      <I18NSelector size="small" confirm={true} />{" "}
      <Button size="small" type="primary" onClick={keep_english}>
        Keep English
      </Button>{" "}
      <Text type="secondary">
        <HiddenXSSM>{I18N_HINT_ACCOUNT_SETTINGS}</HiddenXSSM>{" "}
        <HelpIcon title={intl.formatMessage(I18N_TITLE)}>
          {intl.formatMessage(I18N_MESSAGE)}
        </HelpIcon>{" "}
      </Text>
      <CloseX2 close={keep_english} />
    </div>
  );
};

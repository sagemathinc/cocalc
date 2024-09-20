/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";

import {
  I18N_MESSAGE,
  I18N_TITLE,
  I18NSelector,
} from "@cocalc/frontend/account/i18n-selector";
import {
  CSS,
  React,
  redux,
  useMemo,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { useLocalizationCtx } from "@cocalc/frontend/app/localize";
import { CloseX2, HelpIcon, Icon, Text } from "@cocalc/frontend/components";
import { SiteName } from "@cocalc/frontend/customize";
import {
  DEFAULT_LOCALE,
  OTHER_SETTINGS_LOCALE_KEY,
} from "@cocalc/frontend/i18n";
import { KEEP_EN_LOCALE } from "@cocalc/util/consts/locale";
import { COLORS } from "@cocalc/util/theme";
import { useIntl } from "react-intl";

const VERSION_WARNING_STYLE: CSS = {
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

  function keep_english() {
    redux
      .getActions("account")
      .set_other_settings(OTHER_SETTINGS_LOCALE_KEY, KEEP_EN_LOCALE);
    setLocale(KEEP_EN_LOCALE);
  }

  return (
    <div style={VERSION_WARNING_STYLE}>
      <Text strong>
        <Icon name={"translation-outlined"} /> Use <SiteName /> in a different
        language:
      </Text>{" "}
      <I18NSelector size="small" confirm={true} />{" "}
      <Button size="small" type="primary" onClick={keep_english}>
        Keep English
      </Button>{" "}
      <Text type="secondary">
        You can change the language in "Account" settings as well.{" "}
        <HelpIcon title={intl.formatMessage(I18N_TITLE)}>
          {intl.formatMessage(I18N_MESSAGE)}
        </HelpIcon>{" "}
      </Text>
      <CloseX2 close={keep_english} />
    </div>
  );
};

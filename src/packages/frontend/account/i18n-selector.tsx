/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Basically a drop-down to change the language (i18n localization)
*/

import { DownOutlined } from "@ant-design/icons";
import {
  Button,
  Dropdown,
  MenuProps,
  Modal,
  Select,
  SelectProps,
  Space,
  Tooltip,
} from "antd";
import { SizeType } from "antd/es/config-provider/SizeContext";
import { useState } from "react";
import { defineMessage, useIntl } from "react-intl";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { I18N_HINT_ACCOUNT_SETTINGS } from "@cocalc/frontend/app/i18n-banner";
import { useLocalizationCtx } from "@cocalc/frontend/app/localize";
import { Icon, Paragraph } from "@cocalc/frontend/components";
import {
  getLocale,
  labels,
  Locale,
  LOCALIZATIONS,
  OTHER_SETTINGS_LOCALE_KEY,
} from "@cocalc/frontend/i18n";
import { KEEP_EN_LOCALE } from "@cocalc/util/consts/locale";

interface Props {
  isWide?: boolean;
  size?: SizeType;
  confirm?: boolean;
}

export const I18N_TITLE = defineMessage({
  id: "account.account_page.translation.info.title",
  defaultMessage: "Translation Information",
  description: "Title of translation information modal",
});

export const I18N_MESSAGE = defineMessage({
  id: "account.account_page.translation.info.content",
  defaultMessage: `
We're excited to start offering our application in multiple languages! Here's what you need to know:

<ul>
<li><b>Work in Progress</b>: Our translation effort is just beginning. Many parts of the application are not yet translated.</li>
<li><b>Gradual Improvement</b>: We're continuously working to expand our language coverage. You'll see more content translated over time.</li>
<li><b>Your Help is Welcome</b>: We value our community's input. If you're fluent in multiple languages and would like to contribute to our translation efforts, we'd love to hear from you!</li>
<li><b>Contact Us</b>: To learn more about contributing to translations or to report any issues, please reach out to our support team.</li>
</ul>

Thank you for your patience and understanding as we work to make our application accessible to a global audience!`,
  description: "Content of translation information modal",
});

interface LanguageSelectorProps
  extends Omit<SelectProps, "options" | "onChange"> {
  value?: string;
  onChange?: (language: string) => void;
}

/**
 * A reusable language selector component for translation purposes.
 */
export function LanguageSelector({
  value,
  onChange,
  ...props
}: LanguageSelectorProps) {
  const intl = useIntl();

  let availableLocales = Object.keys(LOCALIZATIONS) as Locale[];

  const options = availableLocales.map((locale) => {
    const localization = LOCALIZATIONS[locale];
    const other =
      locale === value
        ? localization.name
        : intl.formatMessage(localization.trans);
    return {
      value: locale,
      label: `${localization.flag} ${localization.native} (${other})`,
    };
  });

  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      placeholder="Select a language..."
      showSearch
      optionFilterProp="label"
      popupMatchSelectWidth={false}
      {...props}
    />
  );
}

export function I18NSelector(props: Readonly<Props>) {
  const { isWide = true, size, confirm = false } = props;

  const intl = useIntl();
  const { setLocale, locale } = useLocalizationCtx();

  const other_settings = useTypedRedux("account", "other_settings");

  const i18n_enabled = useTypedRedux("customize", "i18n");
  const [langOpen, setLangOpen] = useState<boolean>(false);

  if (
    i18n_enabled == null ||
    i18n_enabled.isEmpty() ||
    (i18n_enabled.size === 1 && i18n_enabled.includes("en"))
  ) {
    return null;
  }

  const i18n: Locale = getLocale(other_settings);

  const items: MenuProps["items"] =
    Object.entries(LOCALIZATIONS)
      .filter(([key, _]) => i18n_enabled.includes(key as any))
      .map(([key, { name, trans, native, flag }]) => {
        const other = key === locale ? name : intl.formatMessage(trans);
        return { key, label: `${flag} ${native} (${other})` };
      }) ?? [];

  items.push({ type: "divider" });
  items.push({
    key: "help",
    label: (
      <Space>
        <Icon name="translation-outlined" />
        {intl.formatMessage({
          id: "account.account_page.translation.info.label",
          defaultMessage: "Translation Info...",
          description: "Label of translation information modal in dropdown",
        })}
      </Space>
    ),
    onClick: () =>
      Modal.info({
        width: "min(90vw, 600px)",
        title: intl.formatMessage(I18N_TITLE),
        content: <Paragraph>{intl.formatMessage(I18N_MESSAGE)}</Paragraph>,
      }),
  });

  function changeLocale(key) {
    const loc = key === "en" ? KEEP_EN_LOCALE : key;
    redux
      .getActions("account")
      .set_other_settings(OTHER_SETTINGS_LOCALE_KEY, loc);
    setLocale(loc);
  }

  const menu: MenuProps = {
    items,
    style: { maxHeight: "75vh", overflow: "auto" },
    onClick: ({ key }) => {
      if (key in LOCALIZATIONS) {
        if (confirm) {
          Modal.confirm({
            onOk: () => changeLocale(key),
            title: intl.formatMessage(
              {
                id: "account.account_page.translation.change.title",
                defaultMessage: "Change language to {lang}?",
              },
              {
                lang: `${LOCALIZATIONS[key].native} (${LOCALIZATIONS[key].name})`,
              },
            ),
            content: I18N_HINT_ACCOUNT_SETTINGS,
          });
        } else {
          changeLocale(key);
        }
      }
    },
  };

  const lang_icon = LOCALIZATIONS[i18n]?.flag;

  const title =
    i18n in LOCALIZATIONS
      ? intl.formatMessage(LOCALIZATIONS[i18n].trans)
      : i18n;

  const cur = `${title} (${LOCALIZATIONS[i18n]?.name ?? i18n})`;
  const msg = intl.formatMessage(labels.account_language_tooltip);
  const tooltip = (
    <>
      {cur}
      <br />
      {msg}
      {labels.account_language_tooltip.defaultMessage != msg ? (
        <>
          <br />({labels.account_language_tooltip.defaultMessage})
        </>
      ) : undefined}
    </>
  );

  return (
    <Tooltip title={langOpen ? undefined : tooltip} trigger={["hover"]}>
      <Dropdown
        menu={menu}
        trigger={["click"]}
        onOpenChange={(open) => setLangOpen(open)}
      >
        <Button size={size}>
          <Space>
            {lang_icon}
            {isWide ? title : undefined}
            <DownOutlined />
          </Space>
        </Button>
      </Dropdown>
    </Tooltip>
  );
}

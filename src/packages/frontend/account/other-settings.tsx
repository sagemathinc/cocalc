/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cSpell:ignore brandcolors codebar

import { Button, Card, Slider } from "antd";
import { debounce } from "lodash";
import { useMemo } from "react";
import { FormattedMessage, defineMessages, useIntl } from "react-intl";

import { Panel, Switch } from "@cocalc/frontend/antd-bootstrap";
import { Rendered, redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { useLocalizationCtx } from "@cocalc/frontend/app/localize";
import {
  A,
  Icon,
  LabeledRow,
  Loading,
  NumberInput,
  Paragraph,
  SelectorInput,
  Text,
} from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { IS_MOBILE, IS_TOUCH } from "@cocalc/frontend/feature";
import LLMSelector from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { LOCALIZATIONS, labels } from "@cocalc/frontend/i18n";
import { getValidActivityBarOption } from "@cocalc/frontend/project/page/activity-bar";
import {
  ACTIVITY_BAR_EXPLANATION,
  ACTIVITY_BAR_KEY,
  ACTIVITY_BAR_LABELS,
  ACTIVITY_BAR_LABELS_DEFAULT,
  ACTIVITY_BAR_OPTIONS,
  ACTIVITY_BAR_TITLE,
  ACTIVITY_BAR_TOGGLE_LABELS,
  ACTIVITY_BAR_TOGGLE_LABELS_DESCRIPTION,
} from "@cocalc/frontend/project/page/activity-bar-consts";
import { NewFilenameFamilies } from "@cocalc/frontend/project/utils";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { DARK_MODE_ICON } from "@cocalc/util/consts/ui";
import { DEFAULT_NEW_FILENAMES, NEW_FILENAMES } from "@cocalc/util/db-schema";
import { DARK_MODE_DEFAULTS } from "@cocalc/util/db-schema/accounts";
import { OTHER_SETTINGS_REPLY_ENGLISH_KEY } from "@cocalc/util/i18n/const";

import {
  DARK_MODE_KEYS,
  DARK_MODE_MINS,
  get_dark_mode_config,
} from "./dark-mode";
import Tours from "./tours";
import { useLanguageModelSetting } from "./useLanguageModelSetting";
import { UserDefinedLLMComponent } from "./user-defined-llm";

// Icon constants for account preferences sections
export const THEME_ICON_NAME = "highlighter";
export const OTHER_ICON_NAME = "gear";

// Import the account state type to get the proper other_settings type
import type { AccountState } from "./types";

const DARK_MODE_LABELS = defineMessages({
  brightness: {
    id: "account.other-settings.theme.dark_mode.brightness",
    defaultMessage: "Brightness",
  },
  contrast: {
    id: "account.other-settings.theme.dark_mode.contrast",
    defaultMessage: "Contrast",
  },
  sepia: {
    id: "account.other-settings.theme.dark_mode.sepia",
    defaultMessage: "Sepia",
  },
});

// See https://github.com/sagemathinc/cocalc/issues/5620
// There are weird bugs with relying only on mathjax, whereas our
// implementation of katex with a fallback to mathjax works very well.
// This makes it so katex can't be disabled.
const ALLOW_DISABLE_KATEX = false;

export function katexIsEnabled() {
  if (!ALLOW_DISABLE_KATEX) {
    return true;
  }
  return redux.getStore("account")?.getIn(["other_settings", "katex"]) ?? true;
}

interface Props {
  other_settings: AccountState["other_settings"];
  is_stripe_customer: boolean;
  kucalc: string;
  mode?: "full" | "appearance" | "ai" | "other";
}

export function OtherSettings(props: Readonly<Props>): React.JSX.Element {
  const intl = useIntl();
  const { locale } = useLocalizationCtx();
  const isCoCalcCom = useTypedRedux("customize", "is_cocalc_com");
  const user_defined_llm = useTypedRedux("customize", "user_defined_llm");

  const [model, setModel] = useLanguageModelSetting();

  function on_change(name: string, value: any): void {
    redux.getActions("account").set_other_settings(name, value);
  }

  // Debounced version for dark mode sliders to reduce CPU usage
  const on_change_dark_mode = useMemo(
    () =>
      debounce((name: string, value: any) => on_change(name, value), 50, {
        trailing: true,
        leading: false,
      }),
    [],
  );

  function toggle_global_banner(val: boolean): void {
    if (val) {
      // this must be "null", not "undefined" – otherwise the data isn't stored in the DB.
      on_change("show_global_info2", null);
    } else {
      on_change("show_global_info2", webapp_client.server_time());
    }
  }

  //   private render_first_steps(): Rendered {
  //     if (props.kucalc !== KUCALC_COCALC_COM) return;
  //     return (
  //       <Switch
  //         checked={!!props.other_settings.get("first_steps")}
  //         onChange={(e) => on_change("first_steps", e.target.checked)}
  //       >
  //         Offer the First Steps guide
  //       </Switch>
  //     );
  //   }

  function render_global_banner(): Rendered {
    return (
      <Switch
        checked={!props.other_settings.get("show_global_info2")}
        onChange={(e) => toggle_global_banner(e.target.checked)}
      >
        <FormattedMessage
          id="account.other-settings.global_banner"
          defaultMessage={`<strong>Show Announcement Banner</strong>: only shows up if there is a
        message`}
        />
      </Switch>
    );
  }

  function render_confirm(): Rendered {
    if (!IS_MOBILE) {
      return (
        <Switch
          checked={!!props.other_settings.get("confirm_close")}
          onChange={(e) => on_change("confirm_close", e.target.checked)}
        >
          <FormattedMessage
            id="account.other-settings.confirm_close"
            defaultMessage={`<strong>Confirm Close:</strong> always ask for confirmation before
          closing the browser window`}
          />
        </Switch>
      );
    }
  }

  function render_katex() {
    if (!ALLOW_DISABLE_KATEX) {
      return null;
    }
    return (
      <Switch
        checked={!!props.other_settings.get("katex")}
        onChange={(e) => on_change("katex", e.target.checked)}
      >
        <FormattedMessage
          id="account.other-settings.katex"
          defaultMessage={`<strong>KaTeX:</strong> attempt to render formulas
              using {katex} (much faster, but missing context menu options)`}
          values={{ katex: <A href={"https://katex.org/"}>KaTeX</A> }}
        />
      </Switch>
    );
  }

  function render_standby_timeout(): Rendered {
    if (IS_TOUCH) {
      return;
    }
    return (
      <LabeledRow
        label={intl.formatMessage({
          id: "account.other-settings.standby_timeout",
          defaultMessage: "Standby timeout",
        })}
      >
        <NumberInput
          on_change={(n) => on_change("standby_timeout_m", n)}
          min={1}
          max={180}
          unit="minutes"
          number={props.other_settings.get("standby_timeout_m") ?? 30}
        />
      </LabeledRow>
    );
  }

  function render_mask_files(): Rendered {
    return (
      <Switch
        checked={!!props.other_settings.get("mask_files")}
        onChange={(e) => on_change("mask_files", e.target.checked)}
      >
        <FormattedMessage
          id="account.other-settings.mask_files"
          defaultMessage={`<strong>Mask Files:</strong> grey out files in the files viewer
            that you probably do not want to open`}
        />
      </Switch>
    );
  }

  function render_default_file_sort(): Rendered {
    return (
      <LabeledRow
        label={intl.formatMessage({
          id: "account.other-settings.default_file_sort.label",
          defaultMessage: "Default file sort",
        })}
      >
        <SelectorInput
          selected={props.other_settings.get("default_file_sort")}
          options={{
            time: intl.formatMessage({
              id: "account.other-settings.default_file_sort.by_time",
              defaultMessage: "Sort by time",
            }),
            name: intl.formatMessage({
              id: "account.other-settings.default_file_sort.by_name",
              defaultMessage: "Sort by name",
            }),
          }}
          on_change={(value) => on_change("default_file_sort", value)}
        />
      </LabeledRow>
    );
  }

  function render_new_filenames(): Rendered {
    const selected =
      props.other_settings.get(NEW_FILENAMES) ?? DEFAULT_NEW_FILENAMES;
    return (
      <LabeledRow
        label={intl.formatMessage({
          id: "account.other-settings.filename_generator.label",
          defaultMessage: "Filename generator",
        })}
      >
        <div>
          <SelectorInput
            selected={selected}
            options={NewFilenameFamilies}
            on_change={(value) => on_change(NEW_FILENAMES, value)}
          />
          <Paragraph
            type="secondary"
            ellipsis={{ expandable: true, symbol: "more" }}
          >
            {intl.formatMessage({
              id: "account.other-settings.filename_generator.description",
              defaultMessage: `Select how automatically generated filenames are generated.
                In particular, to make them unique or to include the current time.`,
            })}
          </Paragraph>
        </div>
      </LabeledRow>
    );
  }

  function render_page_size(): Rendered {
    return (
      <LabeledRow
        label={intl.formatMessage({
          id: "account.other-settings._page_size.label",
          defaultMessage: "Number of files per page",
        })}
      >
        <NumberInput
          on_change={(n) => on_change("page_size", n)}
          min={1}
          max={10000}
          number={props.other_settings.get("page_size") ?? 50}
        />
      </LabeledRow>
    );
  }

  function render_no_free_warnings(): Rendered {
    const isCustomer = props.is_stripe_customer;

    const extra = isCustomer ? (
      <span>(thanks for being a customer)</span>
    ) : (
      <span>(only available to customers)</span>
    );

    return (
      <Switch
        disabled={!isCustomer}
        checked={!!props.other_settings.get("no_free_warnings")}
        onChange={(e) => on_change("no_free_warnings", e.target.checked)}
      >
        <strong>Hide free warnings</strong>: do{" "}
        <strong>
          <i>not</i>
        </strong>{" "}
        show a warning banner when using a free trial project {extra}
      </Switch>
    );
  }

  function render_no_email_new_messages(): Rendered {
    const email_address_verified = useTypedRedux(
      "account",
      "email_address_verified",
    );
    const email_address = useTypedRedux("account", "email_address");
    const isVerified = !!email_address_verified?.get(email_address ?? "");

    return (
      <>
        <Switch
          checked={props.other_settings.get("no_email_new_messages")}
          onChange={(e) => {
            on_change("no_email_new_messages", e.target.checked);
          }}
        >
          Do NOT send email when you get new{" "}
          <Button
            onClick={(e) => {
              e.stopPropagation();
              redux.getActions("page").set_active_tab("notifications");
              redux
                .getActions("mentions")
                .set_filter("messages-inbox" as "messages-inbox");
            }}
            type="link"
            size="small"
          >
            Internal Messages
          </Button>
        </Switch>
        {!isVerified && !props.other_settings.get("no_email_new_messages") && (
          <>
            (NOTE: You must also verify your email address above to get emails
            about new messages.)
          </>
        )}
      </>
    );
  }

  function render_dark_mode(): Rendered {
    const checked = !!props.other_settings.get("dark_mode");
    const config = get_dark_mode_config(props.other_settings.toJS());
    return (
      <div>
        <Switch
          checked={checked}
          onChange={(e) => on_change("dark_mode", e.target.checked)}
          style={{
            backgroundColor: "rgb(36, 37, 37)",
            marginLeft: "-5px",
            padding: "5px",
            borderRadius: "3px",
          }}
          labelStyle={{
            color: "rgba(229, 224, 216)",
          }}
        >
          <FormattedMessage
            id="account.other-settings.theme.dark_mode.compact"
            defaultMessage={`Dark mode: reduce eye strain by showing a dark background (via {DR})`}
            values={{
              DR: (
                <A
                  style={{ color: "#e96c4d", fontWeight: 700 }}
                  href="https://darkreader.org/"
                >
                  DARK READER
                </A>
              ),
            }}
          />
        </Switch>
        {checked ? (
          <Card
            size="small"
            title={
              <>
                <Icon unicode={DARK_MODE_ICON} />{" "}
                {intl.formatMessage({
                  id: "account.other-settings.theme.dark_mode.configuration",
                  defaultMessage: "Dark Mode Configuration",
                })}
              </>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {DARK_MODE_KEYS.map((key) => (
                <div
                  key={key}
                  style={{ display: "flex", gap: 10, alignItems: "center" }}
                >
                  <div style={{ width: 100 }}>
                    {intl.formatMessage(DARK_MODE_LABELS[key])}
                  </div>
                  <Slider
                    min={DARK_MODE_MINS[key]}
                    max={100}
                    value={config[key]}
                    onChange={(x) => on_change_dark_mode(`dark_mode_${key}`, x)}
                    marks={{
                      [DARK_MODE_DEFAULTS[key]]: String(
                        DARK_MODE_DEFAULTS[key],
                      ),
                    }}
                    style={{ flex: 1, width: 0 }}
                  />
                  <Button
                    size="small"
                    onClick={() =>
                      on_change_dark_mode(
                        `dark_mode_${key}`,
                        DARK_MODE_DEFAULTS[key],
                      )
                    }
                  >
                    {intl.formatMessage(labels.reset)}
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        ) : undefined}
      </div>
    );
  }

  function render_antd(): Rendered {
    return (
      <>
        <Switch
          checked={props.other_settings.get("antd_rounded", true)}
          onChange={(e) => on_change("antd_rounded", e.target.checked)}
        >
          <FormattedMessage
            id="account.other-settings.theme.antd.rounded"
            defaultMessage={`<b>Rounded Design</b>: use rounded corners for buttons, etc.`}
          />
        </Switch>
        <Switch
          checked={props.other_settings.get("antd_animate", true)}
          onChange={(e) => on_change("antd_animate", e.target.checked)}
        >
          <FormattedMessage
            id="account.other-settings.theme.antd.animations"
            defaultMessage={`<b>Animations</b>: briefly animate some aspects, e.g. buttons`}
          />
        </Switch>
        <Switch
          checked={props.other_settings.get("antd_brandcolors", false)}
          onChange={(e) => on_change("antd_brandcolors", e.target.checked)}
        >
          <FormattedMessage
            id="account.other-settings.theme.antd.color_scheme"
            defaultMessage={`<b>Color Scheme</b>: use brand colors instead of default colors`}
          />
        </Switch>
        <Switch
          checked={props.other_settings.get("antd_compact", false)}
          onChange={(e) => on_change("antd_compact", e.target.checked)}
        >
          <FormattedMessage
            id="account.other-settings.theme.antd.compact"
            defaultMessage={`<b>Compact Design</b>: use a more compact design`}
          />
        </Switch>
      </>
    );
  }

  function render_vertical_fixed_bar_options(): Rendered {
    const selected = getValidActivityBarOption(
      props.other_settings.get(ACTIVITY_BAR_KEY),
    );
    const options = Object.fromEntries(
      Object.entries(ACTIVITY_BAR_OPTIONS).map(([k, v]) => [
        k,
        intl.formatMessage(v),
      ]),
    );
    return (
      <LabeledRow label={intl.formatMessage(ACTIVITY_BAR_TITLE)}>
        <div>
          <SelectorInput
            style={{ marginBottom: "10px" }}
            selected={selected}
            options={options}
            on_change={(value) => {
              on_change(ACTIVITY_BAR_KEY, value);
              track("flyout", { aspect: "layout", how: "account", value });
            }}
          />
          <Paragraph
            type="secondary"
            ellipsis={{ expandable: true, symbol: "more" }}
          >
            {intl.formatMessage(ACTIVITY_BAR_EXPLANATION)}
          </Paragraph>
          <Switch
            checked={
              props.other_settings.get(ACTIVITY_BAR_LABELS) ??
              ACTIVITY_BAR_LABELS_DEFAULT
            }
            onChange={(e) => {
              on_change(ACTIVITY_BAR_LABELS, e.target.checked);
            }}
          >
            <Paragraph
              type="secondary"
              style={{ marginBottom: 0 }}
              ellipsis={{ expandable: true, symbol: "more" }}
            >
              <Text strong>
                {intl.formatMessage(ACTIVITY_BAR_TOGGLE_LABELS, {
                  show: false,
                })}
              </Text>
              : {intl.formatMessage(ACTIVITY_BAR_TOGGLE_LABELS_DESCRIPTION)}
            </Paragraph>
          </Switch>
        </div>
      </LabeledRow>
    );
  }

  function render_disable_all_llm(): Rendered {
    return (
      <Switch
        checked={!!props.other_settings.get("openai_disabled")}
        onChange={(e) => {
          on_change("openai_disabled", e.target.checked);
          redux.getStore("projects").clearOpenAICache();
        }}
      >
        <FormattedMessage
          id="account.other-settings.llm.disable_all"
          defaultMessage={`<strong>Disable all AI integrations</strong>,
            e.g., code generation or explanation buttons in Jupyter, @chatgpt mentions, etc.`}
        />
      </Switch>
    );
  }

  function render_language_model(): Rendered {
    return (
      <LabeledRow
        label={intl.formatMessage({
          id: "account.other-settings.llm.default_llm",
          defaultMessage: "Default AI Model",
        })}
      >
        <LLMSelector model={model} setModel={setModel} />
      </LabeledRow>
    );
  }

  function render_llm_reply_language(): Rendered {
    return (
      <Switch
        checked={!!props.other_settings.get(OTHER_SETTINGS_REPLY_ENGLISH_KEY)}
        onChange={(e) => {
          on_change(OTHER_SETTINGS_REPLY_ENGLISH_KEY, e.target.checked);
        }}
      >
        <FormattedMessage
          id="account.other-settings.llm.reply_language"
          defaultMessage={`<strong>Always reply in English:</strong>
          If set, the replies are always in English. Otherwise, it replies in your language ({lang}).`}
          values={{ lang: intl.formatMessage(LOCALIZATIONS[locale].trans) }}
        />
      </Switch>
    );
  }

  function render_custom_llm(): Rendered {
    // on cocalc.com, do not even show that they're disabled
    if (isCoCalcCom && !user_defined_llm) return;
    return (
      <UserDefinedLLMComponent
        on_change={on_change}
        style={{ marginTop: "20px" }}
      />
    );
  }

  function render_llm_settings() {
    // we hide this panel, if all servers and user defined LLms are disabled
    const customize = redux.getStore("customize");
    const enabledLLMs = customize.getEnabledLLMs();
    const anyLLMenabled = Object.values(enabledLLMs).some((v) => v);
    if (!anyLLMenabled) return <></>;
    return (
      <Panel
        header={
          <>
            <AIAvatar size={18} />{" "}
            <FormattedMessage
              id="account.other-settings.llm.title"
              defaultMessage={`AI Settings`}
            />
          </>
        }
      >
        {render_disable_all_llm()}
        {render_language_model()}
        {render_llm_reply_language()}
        {render_custom_llm()}
      </Panel>
    );
  }

  if (props.other_settings == null) {
    return <Loading />;
  }

  const mode = props.mode ?? "full";

  if (mode === "ai") {
    return render_llm_settings();
  }

  if (mode === "appearance") {
    return (
      <Panel
        size="small"
        header={
          <>
            <Icon name={THEME_ICON_NAME} />{" "}
            <FormattedMessage
              id="account.other-settings.theme"
              defaultMessage="Theme"
              description="Visual UI theme of the application"
            />
          </>
        }
      >
        {render_antd()}
      </Panel>
    );
  }

  if (mode === "other") {
    return (
      <>
        <Panel
          size="small"
          header={
            <>
              <Icon name="dashboard" />{" "}
              <FormattedMessage
                id="account.other-settings.browser_performance.title"
                defaultMessage="Browser"
              />
            </>
          }
        >
          {render_confirm()}
          {render_standby_timeout()}
        </Panel>

        {/* File Explorer */}
        <Panel
          size="small"
          header={
            <>
              <Icon name="folder-open" />{" "}
              <FormattedMessage
                id="account.other-settings.file_explorer.title"
                defaultMessage="File Explorer"
              />
            </>
          }
        >
          {render_mask_files()}
          {render_new_filenames()}
          {render_default_file_sort()}
          {render_page_size()}
        </Panel>

        {/* Projects */}
        <Panel
          size="small"
          header={
            <>
              <Icon name="edit" />{" "}
              <FormattedMessage
                id="account.other-settings.projects.title"
                defaultMessage="Projects"
              />
            </>
          }
        >
          {render_vertical_fixed_bar_options()}
        </Panel>

        {/* Content Display */}
        <Panel
          size="small"
          header={
            <>
              <Icon name="file-code" />{" "}
              <FormattedMessage
                id="account.other-settings.content_display.title"
                defaultMessage="Content Display"
              />
            </>
          }
        >
          {render_global_banner()}
          {render_katex()}
        </Panel>

        {/* Messages */}
        <Panel
          size="small"
          header={
            <>
              <Icon name="mail" />{" "}
              <FormattedMessage
                id="account.other-settings.messages.title"
                defaultMessage="Messages"
              />
            </>
          }
        >
          {render_no_email_new_messages()}
          {render_no_free_warnings()}
        </Panel>

        {/* Tours at bottom */}
        <Tours />
      </>
    );
  }

  // mode === "full" - original behavior
  return (
    <>
      {render_llm_settings()}

      <Panel
        header={
          <>
            <Icon name={THEME_ICON_NAME} />{" "}
            <FormattedMessage
              id="account.other-settings.theme"
              defaultMessage="Theme"
              description="Visual UI theme of the application"
            />
          </>
        }
      >
        {render_dark_mode()}
        {render_antd()}
      </Panel>

      <Panel
        header={
          <>
            <Icon name={OTHER_ICON_NAME} /> Other
          </>
        }
      >
        {render_confirm()}
        {render_katex()}
        {render_global_banner()}
        {render_mask_files()}
        {render_no_free_warnings()}
        {render_no_email_new_messages()}
        {render_vertical_fixed_bar_options()}
        {render_new_filenames()}
        {render_default_file_sort()}
        {render_page_size()}
        {render_standby_timeout()}
        <div style={{ height: "10px" }} />
        <Tours />
      </Panel>
    </>
  );
}

import UseBalanceTowardSubscriptions from "./balance-toward-subs";

export function UseBalance({ style, minimal }: { style?; minimal? }) {
  const use_balance_toward_subscriptions = useTypedRedux(
    "account",
    "other_settings",
  )?.get("use_balance_toward_subscriptions");

  return (
    <UseBalanceTowardSubscriptions
      minimal={minimal}
      style={style}
      use_balance_toward_subscriptions={use_balance_toward_subscriptions}
      set_use_balance_toward_subscriptions={(value) => {
        const actions = redux.getActions("account");
        actions.set_other_settings("use_balance_toward_subscriptions", value);
      }}
    />
  );
}

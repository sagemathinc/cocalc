/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cSpell:ignore brandcolors codebar

import { FormattedMessage, useIntl } from "react-intl";

import { Panel, Switch } from "@cocalc/frontend/antd-bootstrap";
import { redux, Rendered, useTypedRedux } from "@cocalc/frontend/app-framework";
import { useLocalizationCtx } from "@cocalc/frontend/app/localize";
import {
  Icon,
  IconName,
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
import { labels, LOCALIZATIONS } from "@cocalc/frontend/i18n";
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
import { DEFAULT_NEW_FILENAMES, NEW_FILENAMES } from "@cocalc/util/db-schema";
import { OTHER_SETTINGS_REPLY_ENGLISH_KEY } from "@cocalc/util/i18n/const";

import Tours from "./tours";
import { useLanguageModelSetting } from "./useLanguageModelSetting";
import { UserDefinedLLMComponent } from "./user-defined-llm";

// Icon constants for account preferences sections
export const THEME_ICON_NAME: IconName = "highlighter";
export const OTHER_ICON_NAME: IconName = "gear";

// Import the account state type to get the proper other_settings type
import type { AccountState } from "./types";

interface Props {
  other_settings: AccountState["other_settings"];
  is_stripe_customer: boolean;
  kucalc: string;
  mode: "appearance" | "ai" | "other";
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
          defaultMessage={`<strong>Dim generated files:</strong> gray out files produced by compilers (.aux, .log, .pyc, etc.) so the main files stand out.`}
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

  function render_dim_file_extensions(): Rendered {
    return (
      <Switch
        checked={!!props.other_settings.get("dim_file_extensions")}
        onChange={(e) => on_change("dim_file_extensions", e.target.checked)}
      >
        <strong>Dim file extensions:</strong> gray out file extensions so their
        names stand out.
      </Switch>
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
            <Icon name={THEME_ICON_NAME} /> {intl.formatMessage(labels.theme)}
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
              <Icon name="desktop" /> {intl.formatMessage(labels.browser)}
            </>
          }
        >
          {render_confirm()}
          {render_standby_timeout()}
        </Panel>

        <Panel
          size="small"
          header={
            <>
              <Icon name="folder-open" />{" "}
              {intl.formatMessage(labels.file_explorer)}
            </>
          }
        >
          {render_dim_file_extensions()}
          {render_mask_files()}
          {render_default_file_sort()}
          {render_page_size()}
          {render_new_filenames()}
        </Panel>

        {/* Projects */}
        <Panel
          size="small"
          header={
            <>
              <Icon name="edit" /> {intl.formatMessage(labels.projects)}
            </>
          }
        >
          {render_vertical_fixed_bar_options()}
        </Panel>

        {/* Tours at bottom */}
        <Tours />
      </>
    );
  }

  // mode === "full" no longer exists
  unreachable(mode);
  return <></>;
}

import { unreachable } from "@cocalc/util/misc";
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

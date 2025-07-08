/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Card, InputNumber } from "antd";
import { Map } from "immutable";
import { FormattedMessage, useIntl } from "react-intl";

import { Checkbox, Panel } from "@cocalc/frontend/antd-bootstrap";
import { Rendered, redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { useLocalizationCtx } from "@cocalc/frontend/app/localize";
import {
  A,
  HelpIcon,
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
import { DEFAULT_NEW_FILENAMES, NEW_FILENAMES } from "@cocalc/util/db-schema";
import { OTHER_SETTINGS_REPLY_ENGLISH_KEY } from "@cocalc/util/i18n/const";
import { dark_mode_mins, get_dark_mode_config } from "./dark-mode";
import { I18NSelector, I18N_MESSAGE, I18N_TITLE } from "./i18n-selector";
import Messages from "./messages";
import Tours from "./tours";
import { useLanguageModelSetting } from "./useLanguageModelSetting";
import { UserDefinedLLMComponent } from "./user-defined-llm";

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
  other_settings: Map<string, any>;
  is_stripe_customer: boolean;
  kucalc: string;
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
  //       <Checkbox
  //         checked={!!props.other_settings.get("first_steps")}
  //         onChange={(e) => on_change("first_steps", e.target.checked)}
  //       >
  //         Offer the First Steps guide
  //       </Checkbox>
  //     );
  //   }

  function render_global_banner(): Rendered {
    return (
      <Checkbox
        checked={!props.other_settings.get("show_global_info2")}
        onChange={(e) => toggle_global_banner(e.target.checked)}
      >
        <FormattedMessage
          id="account.other-settings.global_banner"
          defaultMessage={`<strong>Show Announcement Banner</strong>: only shows up if there is a
        message`}
        />
      </Checkbox>
    );
  }

  function render_time_ago_absolute(): Rendered {
    return (
      <Checkbox
        checked={!!props.other_settings.get("time_ago_absolute")}
        onChange={(e) => on_change("time_ago_absolute", e.target.checked)}
      >
        <FormattedMessage
          id="account.other-settings.time_ago_absolute"
          defaultMessage={`<strong>Display Timestamps as absolute points in time</strong>
            instead of relative to the current time`}
        />
      </Checkbox>
    );
  }

  function render_confirm(): Rendered {
    if (!IS_MOBILE) {
      return (
        <Checkbox
          checked={!!props.other_settings.get("confirm_close")}
          onChange={(e) => on_change("confirm_close", e.target.checked)}
        >
          <FormattedMessage
            id="account.other-settings.confirm_close"
            defaultMessage={`<strong>Confirm Close:</strong> always ask for confirmation before
          closing the browser window`}
          />
        </Checkbox>
      );
    }
  }

  function render_katex() {
    if (!ALLOW_DISABLE_KATEX) {
      return null;
    }
    return (
      <Checkbox
        checked={!!props.other_settings.get("katex")}
        onChange={(e) => on_change("katex", e.target.checked)}
      >
        <FormattedMessage
          id="account.other-settings.katex"
          defaultMessage={`<strong>KaTeX:</strong> attempt to render formulas
              using {katex} (much faster, but missing context menu options)`}
          values={{ katex: <A href={"https://katex.org/"}>KaTeX</A> }}
        />
      </Checkbox>
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
          number={props.other_settings.get("standby_timeout_m")}
        />
      </LabeledRow>
    );
  }

  function render_mask_files(): Rendered {
    return (
      <Checkbox
        checked={!!props.other_settings.get("mask_files")}
        onChange={(e) => on_change("mask_files", e.target.checked)}
      >
        <FormattedMessage
          id="account.other-settings.mask_files"
          defaultMessage={`<strong>Mask Files:</strong> grey out files in the files viewer
            that you probably do not want to open`}
        />
      </Checkbox>
    );
  }

  function render_hide_project_popovers(): Rendered {
    return (
      <Checkbox
        checked={!!props.other_settings.get("hide_project_popovers")}
        onChange={(e) => on_change("hide_project_popovers", e.target.checked)}
      >
        <FormattedMessage
          id="account.other-settings.project_popovers"
          defaultMessage={`<strong>Hide Project Tab Popovers:</strong>
            do not show the popovers over the project tabs`}
        />
      </Checkbox>
    );
  }

  function render_hide_file_popovers(): Rendered {
    return (
      <Checkbox
        checked={!!props.other_settings.get("hide_file_popovers")}
        onChange={(e) => on_change("hide_file_popovers", e.target.checked)}
      >
        <FormattedMessage
          id="account.other-settings.file_popovers"
          defaultMessage={`<strong>Hide File Tab Popovers:</strong>
            do not show the popovers over file tabs`}
        />
      </Checkbox>
    );
  }

  function render_hide_button_tooltips(): Rendered {
    return (
      <Checkbox
        checked={!!props.other_settings.get("hide_button_tooltips")}
        onChange={(e) => on_change("hide_button_tooltips", e.target.checked)}
      >
        <FormattedMessage
          id="account.other-settings.button_tooltips"
          defaultMessage={`<strong>Hide Button Tooltips:</strong>
            hides some button tooltips (this is only partial)`}
        />
      </Checkbox>
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
          number={props.other_settings.get("page_size")}
        />
      </LabeledRow>
    );
  }

  function render_no_free_warnings(): Rendered {
    let extra;
    if (!props.is_stripe_customer) {
      extra = <span>(only available to customers)</span>;
    } else {
      extra = <span>(thanks for being a customer)</span>;
    }
    return (
      <Checkbox
        disabled={!props.is_stripe_customer}
        checked={!!props.other_settings.get("no_free_warnings")}
        onChange={(e) => on_change("no_free_warnings", e.target.checked)}
      >
        Hide free warnings: do{" "}
        <b>
          <i>not</i>
        </b>{" "}
        show a warning banner when using a free trial project {extra}
      </Checkbox>
    );
  }

  function render_dark_mode(): Rendered {
    const checked = !!props.other_settings.get("dark_mode");
    const config = get_dark_mode_config(props.other_settings.toJS());
    const label_style = { width: "100px", display: "inline-block" } as const;
    return (
      <div>
        <Checkbox
          checked={checked}
          onChange={(e) => on_change("dark_mode", e.target.checked)}
          style={{
            color: "rgba(229, 224, 216)",
            backgroundColor: "rgb(36, 37, 37)",
            marginLeft: "-5px",
            padding: "5px",
            borderRadius: "3px",
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
        </Checkbox>
        {checked ? (
          <Card
            size="small"
            title={intl.formatMessage({
              id: "account.other-settings.theme.dark_mode.configuration",
              defaultMessage: "Dark Mode Configuration",
            })}
          >
            <span style={label_style}>
              <FormattedMessage
                id="account.other-settings.theme.dark_mode.brightness"
                defaultMessage="Brightness"
              />
            </span>
            <InputNumber
              min={dark_mode_mins.brightness}
              max={100}
              value={config.brightness}
              onChange={(x) => on_change("dark_mode_brightness", x)}
            />
            <br />
            <span style={label_style}>
              <FormattedMessage
                id="account.other-settings.theme.dark_mode.contrast"
                defaultMessage="Contrast"
              />
            </span>
            <InputNumber
              min={dark_mode_mins.contrast}
              max={100}
              value={config.contrast}
              onChange={(x) => on_change("dark_mode_contrast", x)}
            />
            <br />
            <span style={label_style}>
              <FormattedMessage
                id="account.other-settings.theme.dark_mode.sepia"
                defaultMessage="Sepia"
              />
            </span>
            <InputNumber
              min={dark_mode_mins.sepia}
              max={100}
              value={config.sepia}
              onChange={(x) => on_change("dark_mode_sepia", x)}
            />
            <br />
            <span style={label_style}>
              <FormattedMessage
                id="account.other-settings.theme.dark_mode.grayscale"
                defaultMessage="Grayscale"
              />
            </span>
            <InputNumber
              min={dark_mode_mins.grayscale}
              max={100}
              value={config.grayscale}
              onChange={(x) => on_change("dark_mode_grayscale", x)}
            />
          </Card>
        ) : undefined}
      </div>
    );
  }

  function render_antd(): Rendered {
    return (
      <>
        <Checkbox
          checked={props.other_settings.get("antd_rounded", true)}
          onChange={(e) => on_change("antd_rounded", e.target.checked)}
        >
          <FormattedMessage
            id="account.other-settings.theme.antd.rounded"
            defaultMessage={`<b>Rounded Design</b>: use rounded corners for buttons, etc.`}
          />
        </Checkbox>
        <Checkbox
          checked={props.other_settings.get("antd_animate", true)}
          onChange={(e) => on_change("antd_animate", e.target.checked)}
        >
          <FormattedMessage
            id="account.other-settings.theme.antd.animations"
            defaultMessage={`<b>Animations</b>: briefly animate some aspects, e.g. buttons`}
          />
        </Checkbox>
        <Checkbox
          checked={props.other_settings.get("antd_brandcolors", false)}
          onChange={(e) => on_change("antd_brandcolors", e.target.checked)}
        >
          <FormattedMessage
            id="account.other-settings.theme.antd.color_scheme"
            defaultMessage={`<b>Color Scheme</b>: use brand colors instead of default colors`}
          />
        </Checkbox>
        <Checkbox
          checked={props.other_settings.get("antd_compact", false)}
          onChange={(e) => on_change("antd_compact", e.target.checked)}
        >
          <FormattedMessage
            id="account.other-settings.theme.antd.compact"
            defaultMessage={`<b>Compact Design</b>: use a more compact design`}
          />
        </Checkbox>
      </>
    );
  }

  function render_i18n_selector(): Rendered {
    return (
      <LabeledRow label={intl.formatMessage(labels.language)}>
        <div>
          <I18NSelector />{" "}
          <HelpIcon title={intl.formatMessage(I18N_TITLE)}>
            {intl.formatMessage(I18N_MESSAGE)}
          </HelpIcon>
        </div>
      </LabeledRow>
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
          <Checkbox
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
          </Checkbox>
        </div>
      </LabeledRow>
    );
  }

  function render_disable_all_llm(): Rendered {
    return (
      <Checkbox
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
      </Checkbox>
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
      <Checkbox
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
      </Checkbox>
    );
  }

  function render_custom_llm(): Rendered {
    // on cocalc.com, do not even show that they're disabled
    if (isCoCalcCom && !user_defined_llm) return;
    return <UserDefinedLLMComponent on_change={on_change} />;
  }

  function render_llm_settings() {
    // we hide this panel, if all servers and user defined LLms are disabled
    const customize = redux.getStore("customize");
    const enabledLLMs = customize.getEnabledLLMs();
    const anyLLMenabled = Object.values(enabledLLMs).some((v) => v);
    if (!anyLLMenabled) return;
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
  return (
    <>
      {render_llm_settings()}

      <Panel
        header={
          <>
            <Icon name="highlighter" />{" "}
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
            <Icon name="gear" /> Other
          </>
        }
      >
        {render_confirm()}
        {render_katex()}
        {render_time_ago_absolute()}
        {render_global_banner()}
        {render_mask_files()}
        {render_hide_project_popovers()}
        {render_hide_file_popovers()}
        {render_hide_button_tooltips()}
        <Checkbox
          checked={!!props.other_settings.get("hide_navbar_balance")}
          onChange={(e) => on_change("hide_navbar_balance", e.target.checked)}
        >
          <FormattedMessage
            id="account.other-settings.hide_navbar_balance"
            defaultMessage={`<strong>Hide Account Balance</strong> in navigation bar`}
          />
        </Checkbox>
        {render_no_free_warnings()}
        <Checkbox
          checked={!!props.other_settings.get("disable_markdown_codebar")}
          onChange={(e) => {
            on_change("disable_markdown_codebar", e.target.checked);
          }}
        >
          <FormattedMessage
            id="account.other-settings.markdown_codebar"
            defaultMessage={`<strong>Disable the markdown code bar</strong> in all markdown documents.
            Checking this hides the extra run, copy, and explain buttons in fenced code blocks.`}
          />
        </Checkbox>
        {render_i18n_selector()}
        {render_vertical_fixed_bar_options()}
        {render_new_filenames()}
        {render_default_file_sort()}
        {render_page_size()}
        {render_standby_timeout()}
        <div style={{ height: "10px" }} />
        <Tours />
        <Messages />
        <UseBalance style={{ marginTop: "10px" }} />
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

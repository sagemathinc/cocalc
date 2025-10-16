/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cSpell:words lehmer primality mersenne

import { capitalize } from "lodash";
import { useIntl } from "react-intl";

import { AccountState } from "@cocalc/frontend/account/types";
import { Button, Panel } from "@cocalc/frontend/antd-bootstrap";
import { CSS } from "@cocalc/frontend/app-framework";
import { Icon, LabeledRow, SelectorInput } from "@cocalc/frontend/components";
import { cm_options } from "@cocalc/frontend/frame-editors/codemirror/cm-options";
import { labels } from "@cocalc/frontend/i18n";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import { AsyncComponent } from "@cocalc/frontend/misc/async-component";
import { EDITOR_COLOR_SCHEMES } from "@cocalc/util/db-schema/accounts";

interface Props {
  theme: string;
  on_change: (selected: string) => void;
  editor_settings;
  font_size?: number;
  style?: CSS;
  size?: "small";
}

export function EditorSettingsColorScheme(props: Props): React.JSX.Element {
  const intl = useIntl();

  const title = intl.formatMessage({
    id: "account.editor-settings.color-schemes.panel_title",
    defaultMessage: "Editor Color Scheme",
  });

  return (
    <Panel
      size={props.size}
      header={
        <>
          <Icon name="file-alt" /> {title}
        </>
      }
      style={props.style}
    >
      <LabeledRow label={capitalize(title)}>
        <Button
          disabled={props.theme === "default"}
          style={{ float: "right" }}
          onClick={() => {
            props.on_change("default");
          }}
        >
          {intl.formatMessage(labels.reset)}
        </Button>
        <SelectorInput
          style={{ width: "150px" }}
          options={EDITOR_COLOR_SCHEMES}
          selected={props.theme}
          on_change={props.on_change}
          showSearch={true}
        />
      </LabeledRow>
      <CodeMirrorPreview
        editor_settings={props.editor_settings}
        font_size={props.font_size}
      />
    </Panel>
  );
}

const VALUE = `\
def is_prime_lucas_lehmer(p):
    """Test primality of Mersenne number 2**p - 1.
    >>> is_prime_lucas_lehmer(107)
    True
    """
    k = 2**p - 1; s = 4
    for i in range(3, p+1):
        s = (s*s - 2) % k
    return s == 0\
`;

// We make this async to avoid configuring codemirror as part of the initial
// bundle.  This probably doesn't work so well yet though.
const CodeMirrorPreview = AsyncComponent(async () => {
  await import("@cocalc/frontend/codemirror/init");
  return (props: {
    editor_settings: AccountState["editor_settings"];
    font_size?: number;
  }) => {
    // Ensure that we load all the codemirror plugins, modes, etc., so that
    // we can show the codemirror preview of the current theme, fonts, etc.
    import("@cocalc/frontend/codemirror/init");
    const options = cm_options("a.py", props.editor_settings);
    options.lineNumbers = false;
    return (
      <CodeMirrorStatic
        options={options}
        value={VALUE}
        font_size={props.font_size}
      />
    );
  };
});

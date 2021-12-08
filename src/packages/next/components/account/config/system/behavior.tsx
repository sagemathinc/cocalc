import { Space } from "antd";
import Loading from "components/share/loading";
import register from "../register";
import useEditTable from "lib/hooks/edit-table";
import Checkbox from "components/misc/checkbox";
import { SCHEMA } from "@cocalc/util/schema";
import IntegerSlider from "components/misc/integer-slider";

const confirmCloseDesc = `
You can make CoCalc always ask for confirmation before closing a browser tab viewing a project.
Enable this if you have issues with accidentally closing the CoCalc browser tab.
This shouldn't be necessary, since it's unlikely you will loose work if you close
the tab; also when you reopen CoCalc everything should be exactly as you left it.`;

const descKatex = `
The default is to always attempt to render formulas with KaTeX if possible, but you can
uncheck the box below to use MathJax version 2 by default when possible.  KaTeX is faster than
MathJax v2, but there are edge cases that MathJax supports but KaTeX doesn't,
often only for historical reasons; also, MathJax has a useful context menu.
(Some parts of CoCalc only support KaTeX no matter what you select here.)
`;

const descStandby = `
If you are not active for several minutes, you may see the gray and blue CoCalc splash screen
and your browser will minimize resource usage.  The time until the splash screen appears is the
standby timeout, which you can adjust below.  We use it to conserve resources, mainly network
bandwidth and browser CPU cycles. Execution of your code is NOT paused during standby.
`;

register({
  path: "system/behavior",
  title: "Behavior",
  icon: "circle",
  desc: "Configure general behavior of CoCalc, including idle timeout, math rendering, and whether to ask for confirmation before closing the browser window.",
  search: "confirm close exit " + confirmCloseDesc + " " + descKatex,
  Component: () => {
    const { edited, setEdited, original, Save } = useEditTable<Data>({
      accounts: { other_settings: null },
    });
    if (original == null || edited == null) {
      return <Loading />;
    }

    return (
      <Space direction="vertical">
        {Save}
        <h3>Standby Timeout</h3>
        <div>{descStandby}</div>
        <IntegerSlider
          value={edited.other_settings.standby_timeout_m}
          onChange={(standby_timeout_m) => {
            edited.other_settings.standby_timeout_m = standby_timeout_m;
            setEdited(edited);
          }}
          min={1}
          max={180}
          units="minutes"
          defaultValue={
            SCHEMA.accounts.user_query?.get?.fields.other_settings
              ?.standby_timeout_m
          }
        />
        <h3>Math Rendering: KaTeX versus MathJax</h3>
        <div>{descKatex}</div>
        <Checkbox
          defaultValue={
            SCHEMA.accounts.user_query?.get?.fields.other_settings.katex
          }
          checked={edited.other_settings.katex}
          onChange={(checked) => {
            edited.other_settings.katex = checked;
            setEdited(edited);
          }}
        >
          Attempt to use KaTeX if at all possible
        </Checkbox>

        <h3>Confirmation before closing browser tab</h3>
        <div>{confirmCloseDesc}</div>
        <Checkbox
          defaultValue={
            SCHEMA.accounts.user_query?.get?.fields.other_settings.confirm_close
          }
          checked={edited.other_settings.confirm_close}
          onChange={(checked) => {
            edited.other_settings.confirm_close = checked;
            setEdited(edited);
          }}
        >
          Ask for confirmation
        </Checkbox>
      </Space>
    );
  },
});

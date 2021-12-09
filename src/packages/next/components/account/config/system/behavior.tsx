import { Space } from "antd";
import Loading from "components/share/loading";
import register from "../register";
import useEditTable from "lib/hooks/edit-table";

const desc = {
  confirm_close: `You can make CoCalc always ask for confirmation before closing a browser tab viewing a project.
Enable this if you have issues with accidentally closing the CoCalc browser tab.
This shouldn't be necessary, since it's unlikely you will loose work if you close
the tab; also when you reopen CoCalc everything should be exactly as you left it.`,
  katex: `
The default is to always attempt to render formulas with KaTeX if possible, but you can
uncheck the box below to use MathJax version 2 by default when possible.  KaTeX is faster than
MathJax v2, but there are edge cases that MathJax supports but KaTeX doesn't,
often only for historical reasons; also, MathJax has a useful context menu.
(Some parts of CoCalc only support KaTeX no matter what you select here.)
`,
  standby_timeout_m: `
If you are not active for several minutes, you may see the gray and blue CoCalc splash screen
and your browser will minimize resource usage.  The time until the splash screen appears is the
standby timeout, which you can adjust below.  We use it to conserve resources, mainly network
bandwidth and browser CPU cycles. Execution of your code is NOT paused during standby.
`,
  show_global_info2: `
Sometimes there are important announcements about CoCalc, e.g., if there is a major
update available.  You can hide these if you do not want to see them at the top of
the screen for some reason.
`,
};

interface Data {
  other_settings: {
    standby_timeout_m: number;
    katex: boolean;
    confirm_close: boolean;
  };
}

register({
  path: "system/behavior",
  title: "Behavior",
  icon: "circle",
  desc: "Configure general behavior of CoCalc, including idle timeout, math rendering, and whether to ask for confirmation before closing the browser window.",
  search: desc,
  Component: () => {
    const { edited, original, Save, EditBoolean, EditNumber } =
      useEditTable<Data>({
        accounts: { other_settings: null },
      });
    if (original == null || edited == null) {
      return <Loading />;
    }

    return (
      <Space direction="vertical">
        <Save />
        <EditNumber
          icon="ban"
          path="other_settings.standby_timeout_m"
          title="Standby Timeout"
          desc={desc.standby_timeout_m}
          min={1}
          max={180}
          units="minutes"
        />
        <EditBoolean
          path="other_settings.katex"
          icon="tex"
          title="Math Rendering: KaTeX versus MathJax"
          desc={desc.katex}
          label="Attempt to use KaTeX if at all possible"
        />
        <EditBoolean
          icon="times-circle"
          path="other_settings.confirm_close"
          title="Confirmation before closing browser tab"
          desc={desc.confirm_close}
          label="Ask for confirmation"
        />
      </Space>
    );
  },
});

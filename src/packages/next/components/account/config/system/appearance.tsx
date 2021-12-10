import { Space } from "antd";
import Loading from "components/share/loading";
import register from "../register";
import useEditTable from "lib/hooks/edit-table";
import A from "components/misc/A";

const desc = {
  time_ago_absolute: `
You can display timestamps either as absolute points in time or relative to
the current time.`,
  dark_mode: `Use Dark mode to reduce eye strain and save power by showing light text on a dark background.`,
  extra: "dark reader",
};

interface Data {
  other_settings: {
    time_ago_absolute: boolean;
    dark_mode: boolean;
    dark_mode_brightness: number;
    dark_mode_contrast: number;
    dark_mode_sepia: number;
    dark_mode_grayscale: number;
  };
}

register({
  path: "system/appearance",
  title: "Appearance",
  icon: "calendar-week",
  desc: "Configure dark mode and how times are displayed.",
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
      <Space direction="vertical" style={{ width: "100%" }}>
        <Save />

        <EditBoolean
          path="other_settings.dark_mode"
          icon="caret-square-right"
          desc={
            <div
              style={{
                color: "rgba(229, 224, 216, 0.65)",
                backgroundColor: "rgb(36, 37, 37)",
                marginLeft: "-5px",
                padding: "5px",
                borderRadius: "3px",
              }}
            >
              {desc.dark_mode} Dark mode is implemented using{" "}
              <A
                style={{ color: "#e96c4d", fontWeight: 700 }}
                href="https://darkreader.org/"
              >
                DARK READER
              </A>
              , and currently only applies when you are actually editing files
              (e.g., it doesn't change this configuration page).
            </div>
          }
        />

        {edited.other_settings.dark_mode && (
          <div style={{ width: "100%" }}>
            <div
              style={{
                margin: "15px auto",
                maxWidth: "700px",
                border: "1px solid lightgrey",
                padding: "15px",
                borderRadius: "5px",
              }}
            >
              <h2 style={{ textAlign: "center" }}>Parameters</h2>
              <EditNumber
                path="other_settings.dark_mode_brightness"
                title="Brightness"
                min={20}
                max={100}
              />
              <EditNumber
                path="other_settings.dark_mode_contrast"
                title="Contrast"
                min={20}
                max={100}
              />
              <EditNumber
                path="other_settings.dark_mode_sepia"
                title="Sepia"
                min={0}
                max={100}
              />
              <EditNumber
                path="other_settings.dark_mode_grayscale"
                title="Grayscale"
                min={0}
                max={100}
              />
            </div>
          </div>
        )}
        <EditBoolean
          path="other_settings.time_ago_absolute"
          icon="clock"
          title="Timestamp Display"
          desc={desc.time_ago_absolute}
          label="Display timestamps as absolute points in time"
        />
      </Space>
    );
  },
});

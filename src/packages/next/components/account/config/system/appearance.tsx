/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Space } from "antd";

import {
  KEEP_EN_LOCALE,
  LOCALIZATIONS,
  OTHER_SETTINGS_LOCALE_KEY,
} from "@cocalc/util/i18n";
import A from "components/misc/A";
import Loading from "components/share/loading";
import useEditTable from "lib/hooks/edit-table";
import register from "../register";

const DESC = {
  time_ago_absolute: `
You can display timestamps either as absolute points in time or relative to
the current time.`,
  dark_mode: `Use Dark mode to reduce eye strain and save power by showing light text on a dark background.`,
  extra: "dark reader",
  i18n: "Change the user-interface language",
} as const;

interface Data {
  other_settings: {
    time_ago_absolute: boolean;
    dark_mode: boolean;
    dark_mode_brightness: number;
    dark_mode_contrast: number;
    dark_mode_sepia: number;
  };
}

register({
  path: "system/appearance",
  title: "Appearance",
  icon: "calendar-week",
  desc: "Configure dark mode and how times are displayed.",
  search: DESC,
  Component: () => {
    const { edited, original, Save, EditBoolean, EditNumber, EditSelect } =
      useEditTable<Data>({
        accounts: { other_settings: null },
      });

    if (original == null || edited == null) {
      return <Loading />;
    }

    function renderDarkMode() {
      if (edited == null || !edited.other_settings.dark_mode) return;

      return (
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
          </div>
        </div>
      );
    }

    function renderI18N() {
      // derive {locale:name} from LOCALIZATIONS and replace the en with en-keep entry
      const langs: { [key: string]: string } = Object.fromEntries(
        Object.entries(LOCALIZATIONS).map(([key, val]) => [key, val.name]),
      );
      langs[KEEP_EN_LOCALE] = langs.en;
      delete langs.en;

      return (
        <EditSelect
          path={`other_settings.${OTHER_SETTINGS_LOCALE_KEY}`}
          icon="translation-outlined"
          title="Language"
          desc={DESC.i18n}
          options={langs}
          defaultValue={KEEP_EN_LOCALE}
        />
      );
    }

    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        <Save />

        {renderI18N()}

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
              {DESC.dark_mode} Dark mode is implemented using{" "}
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

        {renderDarkMode()}

        <EditBoolean
          path="other_settings.time_ago_absolute"
          icon="clock"
          title="Timestamp Display"
          desc={DESC.time_ago_absolute}
          label="Display timestamps as absolute points in time"
        />
      </Space>
    );
  },
});

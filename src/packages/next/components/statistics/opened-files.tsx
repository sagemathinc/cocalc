import { useMemo, useState } from "react";
import { Stats } from "@cocalc/util/db-schema/stats";
import A from "components/misc/A";
import { Switch, Table } from "antd";
import { file_associations } from "@cocalc/frontend/file-associations";
import { Icon } from "@cocalc/frontend/components/icon";
import { cmp, field_cmp } from "@cocalc/util/cmp";

const openedFilesColumns = [
  {
    title: "Type of File",
    dataIndex: "ext",
    key: "ext",
    render: (ext) => {
      const icon = (
        <Icon
          style={{ marginRight: "10px", fontSize: "14pt" }}
          name={file_associations[ext]?.icon ?? file_associations[""]?.icon}
        />
      );
      const info = extensionToInfo[ext];
      if (info == null)
        return (
          <>
            {icon} {ext}
          </>
        );
      const x = (
        <>
          {icon} {info.desc} (.{ext})
        </>
      );
      if (info.link == null) return x;
      return <A href={info.link}>{x}</A>;
    },
    sorter: (a, b) =>
      cmp(
        extensionToInfo[a.ext]?.desc ?? a.ext,
        extensionToInfo[b.ext]?.desc ?? b.ext
      ),
  },
  {
    title: "Hour",
    dataIndex: "1h",
    key: "1h",
    sorter: field_cmp("1h"),
    defaultSortOrder: "descend" as any,
  },
  { title: "Day", dataIndex: "1d", key: "1d", sorter: field_cmp("1d") },
  { title: "Week", dataIndex: "7d", key: "7d", sorter: field_cmp("7d") },
  {
    title: "Month",
    dataIndex: "30d",
    key: "30d",
    sorter: field_cmp("30d"),
  },
];

const extensionToInfo: { [ext: string]: { desc: string; link?: string } } = {
  md: { desc: "Markdown" },
  py: { desc: "Python", link: "/features/python" },
  jpg: { desc: "Image" },
  pdf: { desc: "PDF" },
  png: { desc: "Image" },
  rmd: { desc: "RMarkdown", link: "/features/r" },
  rnw: { desc: "Knitr" },
  rst: { desc: "ReST" },
  svg: { desc: "Image" },
  tex: { desc: "LaTeX", link: "/features/latex-editor" },
  txt: { desc: "Plain Text" },
  x11: { desc: "X11 Linux Desktop", link: "/features/x11" },
  jpeg: { desc: "Image" },
  lean: { desc: "LEAN theorem prover" },
  rtex: { desc: "Knitr" },
  sage: {
    desc: "SageMath",
    link: "https://www.sagemath.org/",
  },
  term: { desc: "Linux Terminal", link: "/features/terminal" },
  ipynb: { desc: "Jupyter Notebook", link: "/features/jupyter-notebook" },
  tasks: { desc: "Task List", link: "https://doc.cocalc.com/tasks.html" },
  course: {
    desc: "Course Management",
    link: "https://doc.cocalc.com/teaching-instructors.html",
  },
  sagews: {
    desc: "Sage Worksheet",
    link: "https://doc.cocalc.com/sagews.html",
  },
  "sage-chat": { desc: "Chatroom" },
  board: { desc: "Whiteboard", link: "/features/whiteboard" },
} as const;

function processFilesOpened(
  filesOpened,
  distinct: boolean
): {
  rows: {
    ext: string;
    "1h": number;
    "1d": number;
    "7d": number;
    "30d": number;
  }[];
  lastHour: number;
} {
  let lastHour = 0;
  const counts = distinct ? filesOpened.distinct : filesOpened.total;
  const byExtension: {
    [ext: string]: {
      "1h": number;
      "1d": number;
      "7d": number;
      "30d": number;
    };
  } = {};

  for (const time in counts) {
    const extToCount = counts[time];
    for (const ext in extToCount) {
      const cnt = parseInt(extToCount[ext]);
      if (byExtension[ext] == null) {
        byExtension[ext] = { "1h": 0, "1d": 0, "7d": 0, "30d": 0 };
      }
      byExtension[ext][time] += cnt;
      if (time == "1h") {
        lastHour += cnt;
      }
    }
  }

  const rows: {
    ext: string;
    "1h": number;
    "1d": number;
    "7d": number;
    "30d": number;
  }[] = [];
  for (const ext in byExtension) {
    const counts = byExtension[ext];
    rows.push({ ext, ...counts });
  }
  return { rows, lastHour };
}

export default function OpenedFiles({
  filesOpened,
}: {
  filesOpened: Stats["files_opened"];
}) {
  const [distinct, setDistinct] = useState<boolean>(true);
  const { rows, lastHour } = useMemo(
    () => processFilesOpened(filesOpened, distinct),
    [distinct, filesOpened]
  );

  return (
    <div>
      <div style={{ float: "right" }}>
        <Switch checked={distinct} onChange={setDistinct} /> Distinct
      </div>
      <h2>
        {distinct ? "Distinct " : ""}Files Used in the Last Hour: {lastHour}{" "}
      </h2>
      <p>
        Track the number of {distinct ? "distinct" : ""} files of each type that
        people opened during the last hour, day, week and month.
      </p>
      <Table
        dataSource={rows}
        columns={openedFilesColumns}
        bordered
        pagination={false}
        rowKey={"ext"}
      />
    </div>
  );
}

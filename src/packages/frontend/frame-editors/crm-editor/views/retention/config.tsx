import type { Retention } from "../retention";
import dayjs from "dayjs";
import update, { Data } from "./update";
import { Icon } from "@cocalc/frontend/components/icon";
import {
  Button,
  DatePicker,
  Form,
  Input,
  Select,
  Tooltip,
  Alert,
  Progress,
} from "antd";
import { useEffect, useRef, useState } from "react";
import { retentionModels } from "@cocalc/util/db-schema";

const { Item } = Form;
//const { RangePicker } = DatePicker;
interface Props {
  retention: Retention;
  setRetention: (retention) => void;
  setData: (data: Data[] | null) => void;
}

enum PeriodOptions {
  OneDay = "1 day",
  OneWeek = "1 week",
  OneMonth = "1 month",
}

const WARNING = "WARNING: ";

export default function RetentionConfig({
  retention,
  setRetention: setRetention0,
  setData,
}: Props) {
  const [form] = Form.useForm();
  const [updatingData, setUpdatingData] = useState(false);
  const [info, setInfo] = useState("");
  const [percentDone, setPercentDone] = useState(0);
  const setCancelRef = useRef<() => void | null>(null);
  const retentionRef = useRef<Retention>(retention);
  useEffect(() => {
    handleUpdate();
  }, []);

  const setRetention = (retention) => {
    retentionRef.current = retention;
    setRetention0(retention);
    handleUpdate(true);
  };

  const disabledDate = (current) => {
    // Disable all dates after today
    return current >= dayjs().endOf("day");
  };

  const handleUpdate = async (cacheOnly?: boolean) => {
    const err = validateRetention(retentionRef.current);
    if (err) {
      setInfo(err);
      return;
    }
    setUpdatingData(true);
    setInfo("");
    try {
      const data = await update(
        retentionRef.current,
        setCancelRef,
        (progress: string, percentDone: number) => {
          setInfo(progress);
          setPercentDone(percentDone);
        },
        cacheOnly
      );
      setData(data);
      setInfo("");
    } catch (error) {
      setInfo(`${error}`);
    } finally {
      setUpdatingData(false);
    }
  };

  return (
    <div style={{ paddingBottom: "5px", borderBottom: "1px solid #ccc" }}>
      <Form form={form} layout="inline">
        <Select
          style={{ width: "275px", marginRight:'15px' }}
          value={retention.model}
          options={Object.keys(retentionModels).map((option) => ({
            label: retentionModels[option].title,
            value: option,
          }))}
          onChange={(model) => setRetention({ ...retention, model })}
          placeholder="Select model..."
        />
        <Item
          label={
            <Tooltip
              title="When the first cohort starts (1 day long, starting at UTC midnight)"
              mouseEnterDelay={900}
            >
              First Cohort
            </Tooltip>
          }
        >
          <DatePicker
            showToday={false}
            value={retention.start ? dayjs(retention.start) : undefined}
            onChange={(date) =>
              setRetention({
                ...retention,
                start: date?.toDate(),
                stop: date?.toDate(),
              })
            }
            disabledDate={disabledDate}
          />
        </Item>
        {/* This UI for any length cohort is very hard to use. Also, the actual query in production data fails for
            a week long cohort, so I'm commenting it out for now. The above code is solid to use for 1-day cohorts,
            and those seem fine for our use case.
          <Item
            label={
              <Tooltip title="When the first cohort starts and stops (UTC midnight)">
                First Cohort
              </Tooltip>
            }
          >
            <RangePicker
              presets={
                [
                  {
                    label: "Day",
                    value: [dayjs(retention.start), dayjs(retention.start)],
                  },
                  {
                    label: "Week",
                    value: [
                      dayjs(retention.start),
                      dayjs(retention.start).add(1, "week").subtract(1, "day"),
                    ],
                  },
                  {
                    label: "Month",
                    value: [
                      dayjs(retention.start),
                      dayjs(retention.start).add(1, "month").subtract(1, "day"),
                    ],
                  },
                ] as any
              }
              value={[dayjs(retention.start), dayjs(retention.stop)]}
              onChange={(val) => {
                let start = val?.[0];
                let stop = val?.[1];
                if (!start) {
                  start = stop;
                }
                if (!stop) {
                  stop = start;
                }
                setRetention({
                  ...retention,
                  start: start?.toDate(),
                  stop: stop?.toDate(),
                });
              }}
              disabledDate={disabledDate}
            />
          </Item>
        )*/}
        <Item
          label={
            <Tooltip
              title="Length of each active period (a postgresql interval)"
              mouseEnterDelay={900}
            >
              Active Period
            </Tooltip>
          }
          style={{ display: "flex" }}
        >
          <Select
            style={{ width: "100px" }}
            value={retention.period}
            onChange={(period) => setRetention({ ...retention, period })}
            allowClear
            showSearch
          >
            {Object.values(PeriodOptions).map((option) => (
              <Select.Option key={option} value={option}>
                {option}
              </Select.Option>
            ))}
          </Select>
          <Form.Item name="periodFreeForm" noStyle>
            <Input
              allowClear
              style={{ width: "105px", marginLeft: "5px" }}
              placeholder="eg 3 days"
              value={retention.period}
              onChange={(e) =>
                setRetention({ ...retention, period: e.target.value })
              }
            />
          </Form.Item>
        </Item>
        <Item
          label={
            <Tooltip
              title="Consider all cohorts up to this cutoff (UTC midnight)."
              mouseEnterDelay={900}
            >
              Cutoff
            </Tooltip>
          }
        >
          <DatePicker
            showToday
            value={dayjs(retention.dataEnd)}
            onChange={(dataEnd) =>
              setRetention({ ...retention, dataEnd: dataEnd?.toDate() })
            }
            disabledDate={disabledDate}
          />
        </Item>

        <Tooltip
          title={"Compute retention data for all cohorts defined here."}
          mouseEnterDelay={900}
        >
          <Button
            onClick={() => handleUpdate()}
            type="primary"
            disabled={updatingData || !!validateRetention(retention)}
          >
            <Icon
              name={updatingData ? "refresh" : "database"}
              spin={updatingData}
            />{" "}
            {updatingData ? "Fetching data..." : "Fetch Data"}
          </Button>
        </Tooltip>
      </Form>
      {updatingData && (
        <div
          style={{
            maxWidth: "600px",
            margin: "10px auto 0 auto",
            display: "flex",
          }}
        >
          <Progress
            percent={percentDone}
            strokeColor={{ "0%": "#108ee9", "100%": "#87d068" }}
          />
          <Button onClick={() => setCancelRef.current?.()}>Stop</Button>
        </div>
      )}
      {info && (
        <Alert
          showIcon
          style={{ maxWidth: "600px", margin: "5px auto" }}
          message={info}
          type={
            info.includes("error")
              ? "error"
              : info.startsWith(WARNING)
              ? "warning"
              : "info"
          }
          closable
          onClose={() => setInfo("")}
        />
      )}
    </div>
  );
}

// Returns '' if is valid; otehrwise returns an error message
// describing something that is wrong.
export function validateRetention(retention: Retention): string {
  if (!retention.period) {
    return WARNING + "set the period";
  } else if (!retention.model) {
    return WARNING + "set the model";
  } else if (!retention.start) {
    return WARNING + "set the cohort start";
  } else if (!retention.stop) {
    return WARNING + "set the cohort stop";
  } else if (retention.start > retention.stop) {
    return WARNING + "cohort start must be before cohort stop";
  } else if (retention.dataEnd && retention.dataEnd <= retention.stop) {
    return WARNING + "cohort stop must be before cutoff";
  } else {
    return "";
  }
}

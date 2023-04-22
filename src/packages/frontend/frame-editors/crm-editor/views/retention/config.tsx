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
const { Item } = Form;
//const { RangePicker } = DatePicker;
interface Props {
  retention: Retention;
  setRetention: (retention) => void;
  retentionDescription;
  setData: (data: Data[]) => void;
}

enum PeriodOptions {
  OneDay = "1 day",
  OneWeek = "1 week",
  OneMonth = "1 month",
}

const ERROR = "ERROR: ";

export default function RetentionConfig({
  retention,
  setRetention: setRetention0,
  retentionDescription,
  setData,
}: Props) {
  const [form] = Form.useForm();
  const [updatingData, setUpdatingData] = useState(false);
  const [info, setInfo] = useState("");
  const [percentDone, setPercentDone] = useState(0);
  const setCancelRef = useRef<() => void | null>(null);
  useEffect(() => {
    handleUpdate();
  }, []);

  const setRetention = (retention) => {
    setRetention0(retention);
    setInfo(validateRetention(retention));
  };

  if (retentionDescription == null) {
    return null;
  }

  const disabledDate = (current) => {
    // Disable all dates after today
    return current >= dayjs().endOf("day");
  };

  const handleUpdate = async () => {
    const err = validateRetention(retention);
    if (err) {
      setInfo(err);
      return;
    }
    setUpdatingData(true);
    setInfo("");
    try {
      const data = await update(
        retention,
        setCancelRef,
        (progress: string, percentDone: number) => {
          setInfo(progress);
          setPercentDone(percentDone);
        }
      );
      setData(data);
      setInfo("");
    } catch (error) {
      setInfo(`${ERROR}${error.message}`);
    } finally {
      setUpdatingData(false);
    }
  };

  return (
    <div style={{ paddingBottom: "5px", borderBottom: "1px solid #ccc" }}>
      <Form form={form} layout="inline">
        <Item
          label={<Tooltip title="The active user model to use.">Model</Tooltip>}
        >
          <Select
            style={{ width: "150px" }}
            value={retention.model}
            options={retentionDescription.models.map((option) => ({
              label: option,
              value: option,
            }))}
            onChange={(model) => setRetention({ ...retention, model })}
            placeholder="Select model..."
          />
        </Item>
        <Item
          label={
            <Tooltip title="When the first cohort starts (1 day long, starting at UTC midnight)">
              First Cohort
            </Tooltip>
          }
        >
          <DatePicker
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
            <Tooltip title="Length of each active period (a postgresql interval)">
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
            <Tooltip title="Consider all cohorts up to this cutoff (UTC midnight).">
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

        <Tooltip title={"Compute retention data for all cohorts defined here."}>
          <Button
            onClick={handleUpdate}
            type="primary"
            disabled={updatingData || !!validateRetention(retention)}
          >
            <Icon name="refresh" spin={updatingData} />{" "}
            {updatingData ? "Updating data..." : "Update Data"}
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
          <Button onClick={() => setCancelRef.current?.()}>Cancel</Button>
        </div>
      )}
      {info && (
        <Alert
          showIcon
          style={{ maxWidth: "600px", margin: "5px auto" }}
          message={info}
          type={info.startsWith(ERROR) ? "error" : "info"}
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
    return ERROR + "set the period";
  } else if (!retention.model) {
    return ERROR + "set the model";
  } else if (!retention.start) {
    return ERROR + "set the cohort start";
  } else if (!retention.stop) {
    return ERROR + "set the cohort stop";
  } else if (retention.start > retention.stop) {
    return ERROR + "cohort start must be before cohort stop";
  } else if (retention.dataEnd && retention.dataEnd <= retention.stop) {
    return ERROR + "cohort stop must be before cutoff";
  } else {
    return "";
  }
}

import type { Retention } from "../retention";
import dayjs from "dayjs";
import update from "./update";
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
import { useRef, useState } from "react";
const { Item } = Form;

interface Props {
  retention: Retention;
  setRetention: (retention) => void;
  retentionDescription;
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
}: Props) {
  const [form] = Form.useForm();
  const [updatingData, setUpdatingData] = useState(false);
  const [info, setInfo] = useState("");
  const [percentDone, setPercentDone] = useState(0);
  const setCancelRef = useRef<() => void | null>(null);
  const setRetention = (retention) => {
    setRetention0(retention);
    if (!retention.period) {
      setInfo(ERROR + "set the period");
    } else if (!retention.model) {
      setInfo(ERROR + "set the model");
    } else if (!retention.start) {
      setInfo(ERROR + "set the cohort start");
    } else if (!retention.stop) {
      setInfo(ERROR + "set the cohort stop");
    } else if (retention.start >= retention.stop) {
      setInfo(ERROR + "cohort start must be before cohort stop");
    } else if (retention.dataEnd && retention.dataEnd <= retention.stop) {
      setInfo(ERROR + "cohort stop must be before cutoff");
    } else {
      setInfo("");
    }
  };

  if (retentionDescription == null) {
    return null;
  }

  const disabledDate = (current) => {
    // Disable all dates after today
    return current >= dayjs().endOf("day");
  };

  const handleUpdate = async () => {
    setUpdatingData(true);
    setInfo("");
    try {
      await update(
        retention,
        setCancelRef,
        (progress: string, percentDone: number) => {
          setInfo(progress);
          setPercentDone(percentDone);
        }
      );
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
            <Tooltip title="Date when the first cohort starts">
              First Cohort
            </Tooltip>
          }
        >
          <DatePicker
            value={dayjs(retention.start)}
            onChange={(start) => {
              if (!start) {
                start = dayjs(retention.stop).subtract(1, "day");
              }
              setRetention({ ...retention, start: start?.toDate() });
            }}
            disabledDate={disabledDate}
          />
        </Item>
        <Item
          label={
            <Tooltip title="Date when the first cohort ends. All cohorts up to the cutoff date will be considered.">
              to
            </Tooltip>
          }
        >
          <DatePicker
            value={dayjs(retention.stop)}
            onChange={(stop) => {
              if (!stop) {
                stop = dayjs(retention.start).add(1, "day");
              }
              setRetention({ ...retention, stop: stop?.toDate() });
            }}
            disabledDate={disabledDate}
          />
        </Item>
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
            <Tooltip title="We compute data about all cohorts up to this cutoff day.">
              Cutoff
            </Tooltip>
          }
        >
          <DatePicker
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
            disabled={
              updatingData ||
              !retention.period ||
              !retention.model ||
              !retention.start ||
              !retention.stop ||
              retention.start >= retention.stop ||
              (retention.dataEnd && retention.dataEnd <= retention.stop)
            }
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

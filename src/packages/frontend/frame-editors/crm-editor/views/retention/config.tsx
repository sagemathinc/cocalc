import type { Retention } from "../retention";
import dayjs from "dayjs";
import update from "./update";
import { Icon } from "@cocalc/frontend/components/icon";
import { Button, DatePicker, Form, Input, Select, Tooltip, Alert } from "antd";
import { useState } from "react";
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

const SUCCESS = "Update successful!";

export default function RetentionConfig({
  retention,
  setRetention,
  retentionDescription,
}: Props) {
  const [form] = Form.useForm();
  const [buttonDisabled, setButtonDisabled] = useState(false);
  const [error, setError] = useState("");

  if (retentionDescription == null) {
    return null;
  }

  const disabledDate = (current) => {
    // Disable all dates after today
    return current >= dayjs().endOf("day");
  };

  const handleUpdate = async () => {
    setButtonDisabled(true);
    setError("");
    try {
      await update(retention);
      setError(SUCCESS);
    } catch (error) {
      setError(error.message);
    } finally {
      setButtonDisabled(false);
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
              setRetention({ ...retention, start });
            }}
            disabledDate={(date) =>
              disabledDate(date) ||
              (retention.stop && date >= dayjs(retention.stop))
            }
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
              setRetention({ ...retention, stop });
            }}
            disabledDate={(date) =>
              disabledDate(date) ||
              (retention.start && date <= dayjs(retention.start))
            }
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
            onChange={(dataEnd) => setRetention({ ...retention, dataEnd })}
            disabledDate={(date) =>
              disabledDate(date) ||
              (retention.start && date <= dayjs(retention.start))
            }
          />
        </Item>

        <Tooltip title={"Compute retention data for all cohorts defined here."}>
          <Button
            onClick={handleUpdate}
            type="primary"
            disabled={
              buttonDisabled ||
              !retention.period ||
              !retention.model ||
              !retention.start ||
              !retention.stop
            }
          >
            <Icon name="database" />{" "}
            {buttonDisabled ? "Updating data..." : "Update Data"}
          </Button>
        </Tooltip>
      </Form>
      {error && (
        <Alert
          showIcon
          style={{ maxWidth: "600px", margin: "5px auto" }}
          message={error}
          type={error == SUCCESS ? "info" : "error"}
          closable
          onClose={() => setError("")}
        />
      )}
    </div>
  );
}

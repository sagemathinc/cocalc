/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* A pretty simple API wrapping antd's much more complicated
   date picking api.  Use this if you just need to pick
   a date and time easily.  For more complicated applications,
   check out

       https://ant.design/components/date-picker/
*/

import { DatePicker } from "antd";
import dayjs from "dayjs";

import { React } from "@cocalc/frontend/app-framework";

interface Props {
  placeholder?: string;
  value?: any;
  onChange?: (date: dayjs.Dayjs | null, dateString: string) => void;
  onFocus?: Function;
  onBlur?: Function;
  open?: boolean;
  style?: React.CSSProperties;
  format?: string; // refer to day.js, see https://ant.design/components/date-picker#components-date-picker-demo-format and https://day.js.org/docs/en/display/format
}

export function DateTimePicker(props: Props) {
  const {
    placeholder,
    value,
    onChange,
    onFocus,
    onBlur,
    open,
    style,
    format = "YYYY-MM-DD HH:mm Z",
  } = props;

  const props2: any = {
    showTime: true,
    format,
    placeholder,
    onChange: onChange,
    style,
  };

  if (open != null) {
    props2.open = open;
  }

  if (value != null) {
    props2.value = dayjs(value);
  } else {
    props2.value = null;
  }

  if (onFocus != null || onBlur != null) {
    props2.onOpenChange = (status) => {
      if (status && onFocus != null) {
        onFocus();
      } else if (!status && onBlur != null) {
        onBlur();
      }
    };
  }

  return <DatePicker changeOnBlur {...props2} />;
}

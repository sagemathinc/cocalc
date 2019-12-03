/* A pretty simple API wrapping antd's much more complicated
   date picking api.  Use this if you just need to pick
   a date and time easily.  For more complicated applications,
   check out

       https://ant.design/components/date-picker/
*/

import { React } from "../app-framework";

import { DatePicker } from "cocalc-ui";
import * as moment from "moment";

export function DateTimePicker(props: {
  placeholder?: string;
  value?: any;
  onChange?: (date: moment.Moment | null, dateString: string) => void;
  onFocus?: Function;
  onBlur?: Function;
  open?: boolean;
  style?: React.CSSProperties;
}) {
  const props2: any = {
    showTime: true,
    format: "LLL",
    placeholder: props.placeholder,
    onChange: props.onChange,
    style: props.style
  };
  if (props.open != null) {
    props2.open = props.open;
  }
  if (props.value != null) {
    props2.value = moment(props.value);
  } else {
    props2.value = null;
  }
  if (props.onFocus != null || props.onBlur != null) {
    props2.onOpenChange = status => {
      if (status && props.onFocus != null) {
        props.onFocus();
      } else if (!status && props.onBlur != null) {
        props.onBlur();
      }
    };
  }
  return <DatePicker {...props2} />;
}

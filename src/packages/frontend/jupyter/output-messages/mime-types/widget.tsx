import register from "./register";
//import { Widget } from "../widget";
import { IpyWidget } from "../ipywidget";

register(
  "application/vnd.jupyter.widget-view+json",
  10,
  ({ value, actions, id }) => {
    return (
      <div style={{ margin: "15px 0" }}>
        <IpyWidget value={value} actions={actions} id={id} />
      </div>
    );

    //     // name provides the redux state of the widget, which is
    //     // needed in our code to display or use the widget.
    //     return (
    //       <div>
    //         <Widget value={value} actions={actions} name={name} />
    //         <IpyWidget value={value} actions={actions} name={name} />
    //       </div>
    //     );
  },
);

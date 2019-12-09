import * as React from "react";
import * as ReactDOM from "react-dom";

const AsyncComponent: React.FC = ({}) => {
  const [Component, setComponent] = React.useState<any>(() => {
    return (): null => {
      return null;
    };
  });

  React.useEffect(() => {
    const getWidget = async (): Promise<void> => {
      const { Loading } = await import("../smc-webapp/r_misc/loading");
      setComponent((): any => {
        return Loading;
      });
    };
    getWidget();
  }, []);

  return <Component />;
};

export const App: React.FC = () => {
  const [show_complex_component, set_show_complex_component] = React.useState(
    false
  );

  return (
    <div className="App">
      <header className="App-header">
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
        <div
          className="App-link"
          onClick={(): void => {
            set_show_complex_component(true);
          }}
        >
          Load some heavy stuff
        </div>
        {show_complex_component && <AsyncComponent />}
      </header>
    </div>
  );
};

exports.render = (): void => {
  ReactDOM.render(<App />, document.getElementById("smc-react-container"));
};

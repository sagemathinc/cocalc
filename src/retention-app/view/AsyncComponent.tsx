import * as React from "react";

const AsyncComponent: React.FC = ({}) => {
  const [Component, setComponent] = React.useState<any>(() => {
    return (): null => {
      return null;
    };
  });

  React.useEffect(() => {
    const getWidget = async (): Promise<void> => {
      const { Loading } = await import("../../smc-webapp/r_misc/loading");
      setComponent((): any => {
        return Loading;
      });
    };
    getWidget();
  }, []);

  return <Component />;
};
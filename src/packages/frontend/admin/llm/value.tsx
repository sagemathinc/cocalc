import { Icon, Text } from "@cocalc/frontend/components";

export function Value({ val }: { val: any }) {
  switch (typeof val) {
    case "boolean":
      return val ? <Icon unicode={0x2705} /> : <Icon unicode={0x274c} />;
    case "number":
      return <>`${val}`</>;
    default:
      return <Text code>{JSON.stringify(val)}</Text>;
  }
}

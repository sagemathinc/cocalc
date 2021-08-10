import { useState } from "react";

// Use this to count up or down. e.g.
// const {val: counter_value, inc: inc_counter} = useCounter()
export default function useCounter(init: number = 0) {
  const [val, setVal] = useState(init);
  const inc = () => setVal(val + 1);
  const dec = () => setVal(val - 1);
  return { val, inc, dec };
}

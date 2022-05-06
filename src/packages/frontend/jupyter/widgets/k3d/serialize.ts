import { unzlibSync, zlibSync } from "fflate";
import { isNumber, invert } from "lodash";

// This probably **has** to be the one from the core library to interop properly:
import { Float16Array } from "k3d/dist/standalone";

const typesToArray = {
  int8: Int8Array,
  int16: Int16Array,
  int32: Int32Array,
  uint8: Uint8Array,
  uint16: Uint16Array,
  uint32: Uint32Array,
  float16: Float16Array,
  float32: Float32Array,
  float64: Float64Array,
};

type Shape = Array<number>;
type DType = keyof typeof typesToArray;
type ValueOf<T> = T[keyof T];
type ArrayType = ValueOf<typeof typesToArray>;
type CompressionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; // from upstream, evidently.

const arrayToTypes = invert(typesToArray);

function isNumeric(n: any): boolean {
  return !Number.isNaN(parseFloat(n)) && Number.isFinite(parseFloat(n));
}

function deserializeArray(obj: {
  dtype: DType;
  data?: DataView;
  compressed_data?: DataView;
  shape: Shape;
}) {
  const { dtype } = obj;
  if (obj.data !== undefined) {
    return {
      dtype,
      data: new typesToArray[dtype](obj.data.buffer),
      shape: obj.shape,
    };
  }
  if (obj.compressed_data !== undefined) {
    const buffer = new typesToArray[dtype](
      unzlibSync(new Uint8Array(obj.compressed_data.buffer)).buffer
    );

    console.log(
      `K3D: Receive: ${buffer.byteLength} bytes compressed to ${obj.compressed_data.byteLength} bytes`
    );

    return {
      dtype,
      data: buffer,
      shape: obj.shape,
    };
  }
  return obj;
}

export function deserialize(obj, manager) {
  if (obj == null) {
    return null;
  }
  if (typeof obj === "string" || typeof obj === "boolean") {
    return obj;
  }
  if (isNumber(obj)) {
    // plain number
    return obj;
  }
  if (obj.shape !== undefined) {
    // plain data
    return deserializeArray(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map((v) => deserialize(v, manager));
  }
  // time series or dict
  let timeSeries = true;
  const deserializedObj: any = {};
  for (const k in obj) {
    if (!isNumeric(k)) {
      timeSeries = false;
    }
    deserializedObj[k] = deserialize(obj[k], manager);
  }
  if (timeSeries) {
    deserializedObj.timeSeries = true;
  }

  return deserializedObj;
}

function serializeArray(obj: {
  compression_level?: CompressionLevel;
  data: ArrayType;
  shape: Shape;
  dtype?: DType;
}): { dtype: DType; shape: Shape; compressed_data?: any; data?: any } {
  if (obj.dtype == null) {
    obj.dtype = arrayToTypes[obj.data.constructor] as DType;
  }
  if (obj.compression_level && obj.compression_level > 0) {
    return {
      dtype: obj.dtype,
      compressed_data: zlibSync(obj.data.buffer, {
        level: obj.compression_level,
      }),
      shape: obj.shape,
    };
  }
  return {
    dtype: obj.dtype,
    shape: obj.shape,
    data: obj.data,
  };
}

export function serialize(
  obj:
    | number
    | string
    | boolean
    | null
    | { data: ArrayType; shape: Shape; dtype: DType }
) {
  if (isNumber(obj)) {
    return obj;
  }
  if (typeof obj === "string" || typeof obj === "boolean") {
    return obj;
  }

  if (obj !== null) {
    if (
      obj.data !== undefined &&
      obj.shape !== undefined &&
      obj.dtype !== undefined
    ) {
      return serializeArray(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map(serialize);
    }
    // time series or dict
    const v: { [key: string]: any } = {};
    for (const k in obj) {
      v[k] = serialize(obj[k]);
    }
    return v;
  }
  return null;
}

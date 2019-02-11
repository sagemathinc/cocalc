/*
Very, very simple key:value store.

The keys can be arbitrary json-able objects.
A frozen copy of the object is saved in the key:value store,
so it won't get mutated.
*/

const json = require("json-stable-stringify");

exports.key_value_store = () => new KeyValueStore();

class KeyValueStore {
  constructor() {
    this.set = this.set.bind(this);
    this.get = this.get.bind(this);
    this.delete = this.delete.bind(this);
    this.close = this.close.bind(this);
    this._data = {};
  }

  assert_not_closed() {
    if (this._data == null) {
      throw Error("closed");
    }
  }

  set(key, value) {
    this.assert_not_closed();
    if (value.freeze != null) {
      // supported by modern browsers
      value = value.freeze(); // so doesn't get mutated
    }
    this._data[json(key)] = value;
  }

  get(key) {
    this.assert_not_closed();
    return this._data[json(key)];
  }

  delete(key) {
    this.assert_not_closed();
    delete this._data[json(key)];
  }

  close() {
    delete this._data;
  }
}

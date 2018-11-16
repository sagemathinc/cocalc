
// Immutable string document that satisfies our spec.
class StringDocument {
  constructor(_value = "") {
    this.to_str = this.to_str.bind(this);
    this.is_equal = this.is_equal.bind(this);
    this.apply_patch = this.apply_patch.bind(this);
    this.make_patch = this.make_patch.bind(this);
    this._value = _value;
  }

  to_str() {
    return this._value;
  }

  is_equal(other) {
    return this._value === (other != null ? other._value : undefined);
  }

  apply_patch(patch) {
    return new StringDocument(apply_patch(patch, this._value)[0]);
  }

  make_patch(other) {
    if (
      this._value == null ||
      (other != null ? other._value : undefined) == null
    ) {
      // document not inialized or other not meaningful
      return;
    }
    return make_patch(this._value, other._value);
  }
}

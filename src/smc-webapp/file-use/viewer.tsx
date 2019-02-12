/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

const FileUseViewer = rclass({
  displayName: "FileUseViewer",

  propTypes: {
    redux: rtypes.object,
    file_use_list: rtypes.object.isRequired,
    user_map: rtypes.object.isRequired,
    project_map: rtypes.object.isRequired,
    account_id: rtypes.string.isRequired
  },

  getInitialState() {
    return {
      search: "",
      cursor: 0,
      show_all: false
    };
  },

  render_search_box() {
    return (
      <span key="search_box" className="smc-file-use-notifications-search">
        <SearchInput
          autoFocus={true}
          placeholder="Search..."
          default_value={this.state.search}
          on_change={value =>
            this.setState({ search: value, cursor: 0, show_all: false })
          }
          on_submit={this.open_selected}
          on_escape={before => {
            if (!before) {
              this.actions("page").toggle_show_file_use();
              return this.setState({ cursor: 0, show_all: false });
            }
          }}
          on_up={() =>
            this.setState({ cursor: Math.max(0, this.state.cursor - 1) })
          }
          on_down={() =>
            this.setState({
              cursor: Math.max(
                0,
                Math.min(
                  ((this._visible_list != null
                    ? this._visible_list.length
                    : undefined) != null
                    ? this._visible_list != null
                      ? this._visible_list.length
                      : undefined
                    : 0) - 1,
                  this.state.cursor + 1
                )
              )
            })
          }
        />
      </span>
    );
  },

  click_mark_all_read() {
    this.actions("file_use").mark_all("read");
    return this.actions("page").toggle_show_file_use();
  },

  render_mark_all_read_button() {
    return (
      <Button key="mark_all_read_button" onClick={this.click_mark_all_read}>
        <Icon name="check-square" /> Mark All Read
      </Button>
    );
  },

  open_selected() {
    return open_file_use_entry(
      __guard__(
        this._visible_list != null
          ? this._visible_list[this.state.cursor]
          : undefined,
        x => x.toJS()
      ),
      this.props.redux
    );
  },

  render_list() {
    let v = this.props.file_use_list.toArray();
    if (this.state.search) {
      const s = misc.search_split(this.state.search.toLowerCase());
      v = (() => {
        const result = [];
        for (let x of Array.from(v)) {
          if (misc.search_match(x.get("search"), s)) {
            result.push(x);
          }
        }
        return result;
      })();
    }
    if (!this.state.show_all) {
      this._num_missing = Math.max(0, v.length - SHORTLIST_LENGTH);
      v = v.slice(0, SHORTLIST_LENGTH);
    }
    this._visible_list = v;
    const r = [];
    for (let i = 0; i < v.length; i++) {
      const info = v[i];
      r.push(
        <FileUse
          key={`file-use-${i}`}
          cursor={i === this.state.cursor}
          redux={this.props.redux}
          info={info}
          account_id={this.props.account_id}
          user_map={this.props.user_map}
          project_map={this.props.project_map}
        />
      );
    }
    return r;
  },

  render_show_all() {
    if (this._num_missing) {
      return (
        <Button
          key="show_all"
          onClick={e => {
            e.preventDefault();
            return this.setState({ show_all: true });
          }}
        >
          Show {this._num_missing} More
        </Button>
      );
    }
  },

  render_show_less() {
    const n = this._visible_list.length - SHORTLIST_LENGTH;
    if (n > 0) {
      return (
        <Button
          key="show_less"
          onClick={e => {
            e.preventDefault();
            return this.setState({ show_all: false });
          }}
        >
          Show {n} Less
        </Button>
      );
    }
  },

  render_toggle_all() {
    return (
      <div key="toggle_all" style={{ textAlign: "center", marginTop: "2px" }}>
        {this.state.show_all ? this.render_show_less() : this.render_show_all()}
      </div>
    );
  },

  render() {
    return (
      <div className={"smc-file-use-viewer"}>
        <Row key="top">
          <Col sm={7}>{this.render_search_box()}</Col>
          <Col sm={5}>
            <div style={{ float: "right" }}>
              {this.render_mark_all_read_button()}
            </div>
          </Col>
        </Row>
        {this.render_list()}
        {this.render_toggle_all()}
      </div>
    );
  }
});

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}

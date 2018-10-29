/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Showing list of users of a project
*/

const { Component, React, redux, rtypes, rclass } = require("../app-framework");

const { User } = require("../users");

const { Loading, r_join } = require("../r_misc");

class ProjectUsers extends Component {
  static initClass() {
    this.prototype.displayName = "ProjectUsers";

    this.prototype.reduxProps = {
      users: {
        user_map: rtypes.immutable
      },
      account: {
        account_id: rtypes.string
      }
    };
  }

  propTypes() {
    return {
      project: rtypes.immutable.Map.isRequired,
      none: rtypes.object // optional component to display if there are no other users
    };
  }

  render() {
    let left;
    let account_id;
    if (this.props.user_map == null) {
      return <Loading />;
    }
    const users =
      (left = __guard__(this.props.project.get("users"), x =>
        x.keySeq().toArray()
      )) != null
        ? left
        : [];
    const other = (() => {
      const result = [];
      for (account_id of Array.from(users)) {
        if (account_id !== this.props.account_id) {
          result.push({ account_id });
        }
      }
      return result;
    })();
    redux
      .getStore("projects")
      .sort_by_activity(other, this.props.project.get("project_id"));
    const v = [];
    for (
      let i = 0, end = other.length, asc = 0 <= end;
      asc ? i < end : i > end;
      asc ? i++ : i--
    ) {
      v.push(
        <User
          key={other[i].account_id}
          last_active={other[i].last_active}
          account_id={other[i].account_id}
          user_map={this.props.user_map}
        />
      );
    }
    if (v.length > 0) {
      return r_join(v);
    } else if (this.props.none) {
      return this.props.none;
    } else {
      return <span />;
    }
  }
}
ProjectUsers.initClass();

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}

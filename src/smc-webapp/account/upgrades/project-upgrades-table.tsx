/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
class ProjectUpgradesTable {
  static initClass() {
    this.prototype.reduxProps = {
      account: {
        get_total_upgrades: rtypes.func,
      },
      customize: {
        help_email: rtypes.string,
      },
      projects: {
        project_map: rtypes.immutable.Map,
        get_total_upgrades_you_have_applied: rtypes.func,
        get_upgrades_you_applied_to_project: rtypes.func,
        get_total_project_quotas: rtypes.func,
        get_upgrades_to_project: rtypes.func,
        get_projects_upgraded_by: rtypes.func,
      },
    };
  }

  getInitialState() {
    return {
      show_adjustor: immutable.Map({}), // project_id : bool
      expand_remove_all_upgrades: false,
      remove_all_upgrades_error: undefined,
    };
  }

  open_project_settings(e, project_id) {
    this.actions("projects").open_project({
      project_id,
      target: "settings",
      switch_to: !(e.which === 2 || e.ctrlKey || e.metaKey),
    });
    return e.preventDefault();
  }

  submit_upgrade_quotas({ project_id, new_quotas }) {
    this.actions("projects").apply_upgrades_to_project(project_id, new_quotas);
    return this.toggle_adjustor(project_id);
  }

  generate_on_click_adjust(project_id) {
    return (e) => {
      e.preventDefault();
      return this.toggle_adjustor(project_id);
    };
  }

  toggle_adjustor(project_id) {
    const status = this.state.show_adjustor.get(project_id);
    const n = this.state.show_adjustor.set(project_id, !status);
    return this.setState({ show_adjustor: n });
  }

  render_upgrades_to_project(project_id, upgrades) {
    const v = [];
    for (let param in upgrades) {
      const val = upgrades[param];
      if (!val) {
        continue;
      }
      const info = PROJECT_UPGRADES.params[param];
      if (info == null) {
        console.warn(
          `Invalid upgrades database entry for project_id='${project_id}' -- if this problem persists, email ${this.props.help_email} with the project_id: ${param}`
        );
        continue;
      }
      const n = round1(val != null ? info.display_factor * val : 0);
      v.push(
        <span key={param}>
          {info.display}: {n} {misc.plural(n, info.display_unit)}
        </span>
      );
    }
    return r_join(v);
  }

  render_upgrade_adjustor(project_id) {
    return (
      <UpgradeAdjustor
        key={`adjustor-${project_id}`}
        project_id={project_id}
        total_project_quotas={this.props.get_total_project_quotas(project_id)}
        upgrades_you_can_use={this.props.get_total_upgrades()}
        upgrades_you_applied_to_all_projects={this.props.get_total_upgrades_you_have_applied()}
        upgrades_you_applied_to_this_project={this.props.get_upgrades_you_applied_to_project(
          project_id
        )}
        quota_params={PROJECT_UPGRADES.params}
        submit_upgrade_quotas={(new_quotas) =>
          this.submit_upgrade_quotas({ new_quotas, project_id })
        }
        cancel_upgrading={() => this.toggle_adjustor(project_id)}
        style={{ margin: "25px 0px 0px 0px" }}
        omit_header={true}
      />
    );
  }

  render_upgraded_project(project_id, upgrades, darker) {
    const { ProjectTitle } = require("./projects");
    return (
      <Row
        key={project_id}
        style={darker ? { backgroundColor: "#eee" } : undefined}
      >
        <Col sm={4}>
          <ProjectTitle
            project_id={project_id}
            project_map={this.props.project_map}
            handle_click={(e) => this.open_project_settings(e, project_id)}
          />
        </Col>
        <Col sm={8}>
          <a onClick={this.generate_on_click_adjust(project_id)} role="button">
            {this.render_upgrades_to_project(project_id, upgrades)}
          </a>
        </Col>
        {this.state.show_adjustor.get(project_id)
          ? this.render_upgrade_adjustor(project_id)
          : undefined}
      </Row>
    );
  }

  render_upgraded_projects_rows(upgraded_projects) {
    let i = -1;
    return (() => {
      const result = [];
      for (let project_id in upgraded_projects) {
        const upgrades = upgraded_projects[project_id];
        i += 1;
        result.push(
          this.render_upgraded_project(project_id, upgrades, i % 2 === 0)
        );
      }
      return result;
    })();
  }

  async confirm_reset(e) {
    try {
      return await webapp_client.project_client.remove_all_upgrades();
    } catch (err) {
      return this.setState({
        expand_remove_all_upgrades: false,
        remove_all_upgrades_error: err != null ? err.toString() : undefined,
      });
    }
  }

  render_remove_all_upgrades_error() {
    let err = this.state.remove_all_upgrades_error;
    if (!misc.is_string(err)) {
      err = JSON.stringify(err);
    }
    return (
      <Row>
        <Col sm={12}>
          <ErrorDisplay
            title={"Error removing all upgrades"}
            error={err}
            onClose={() =>
              this.setState({ remove_all_upgrades_error: undefined })
            }
          />
        </Col>
      </Row>
    );
  }

  render_remove_all_upgrades_conf() {
    return (
      <Row>
        <Col sm={12}>
          <ResetProjectsConfirmation
            on_confirm={this.confirm_reset}
            on_cancel={() =>
              this.setState({ expand_remove_all_upgrades: false })
            }
          />
        </Col>
      </Row>
    );
  }

  render_header() {
    return (
      <div>
        <Row>
          <Col sm={12} style={{ display: "flex" }}>
            <h4 style={{ flex: "1" }}>Upgrades you have applied to projects</h4>
            <Button
              bsStyle={"warning"}
              onClick={() =>
                this.setState({ expand_remove_all_upgrades: true })
              }
              disabled={this.state.expand_remove_all_upgrades}
            >
              Remove All Upgrades You Applied to Projects...
            </Button>
          </Col>
        </Row>
        {this.state.remove_all_upgrades_error
          ? this.render_remove_all_upgrades_error()
          : undefined}
        {this.state.expand_remove_all_upgrades
          ? this.render_remove_all_upgrades_conf()
          : undefined}
      </div>
    );
  }

  render() {
    const upgraded_projects = this.props.get_projects_upgraded_by();
    if (!misc.len(upgraded_projects)) {
      return null;
    }
    return (
      <Panel header={this.render_header()}>
        <Row key="header">
          <Col sm={4}>
            <strong>Project</strong>
          </Col>
          <Col sm={8}>
            <strong>
              Upgrades you have applied to this project (click to edit)
            </strong>
          </Col>
        </Row>
        {this.render_upgraded_projects_rows(upgraded_projects)}
      </Panel>
    );
  }
}
*/
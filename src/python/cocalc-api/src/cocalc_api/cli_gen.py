"""
Dynamic CLI generation from API wrapper classes.

Introspects Hub, Project, and Organizations namespace classes at import
time (no instantiation, no network) and generates Click commands from
method signatures, type hints, and docstrings.

Adding a new method to any wrapper class automatically creates a CLI
command — no edits to cli.py needed.
"""

import inspect
import json
import os
import sys
import types
import typing
from typing import Any, Callable, Optional

import click


# ---------------------------------------------------------------------------
# Type mapping: Python annotations → Click parameter types
# ---------------------------------------------------------------------------

def _python_type_to_click(annotation) -> tuple[Any, bool, bool]:
    """
    Convert a Python type annotation to (click_type, is_multiple, is_flag).

    Returns:
        click_type: A Click type (e.g. click.STRING) or None for flags
        is_multiple: True if the CLI option should accept multiple values
        is_flag: True if the CLI option is a boolean flag
    """
    origin = typing.get_origin(annotation)
    args = typing.get_args(annotation)

    # Unwrap Optional[X] (Union[X, None])
    if origin is typing.Union:
        non_none = [a for a in args if a is not type(None)]
        if len(non_none) == 1:
            return _python_type_to_click(non_none[0])
        # str | list[str] style unions
        if any(typing.get_origin(a) is list for a in non_none):
            return click.STRING, True, False

    # Python 3.10+ union syntax: str | list[str] | None
    if isinstance(annotation, types.UnionType):
        non_none = [a for a in args if a is not type(None)]
        if len(non_none) == 1:
            return _python_type_to_click(non_none[0])
        if any(typing.get_origin(a) is list for a in non_none):
            return click.STRING, True, False

    # Literal["a", "b", ...]
    if origin is typing.Literal:
        return click.Choice(list(str(a) for a in args)), False, False

    # list[str], list[int], etc.
    if origin is list:
        inner = args[0] if args else str
        return _simple_type(inner), True, False

    # bool → flag
    if annotation is bool:
        return None, False, True

    # dict → JSON string
    if origin is dict or annotation is dict:
        return click.STRING, False, False

    return _simple_type(annotation), False, False


def _simple_type(annotation) -> Any:
    """Map a simple Python type to a Click type."""
    if annotation is int:
        return click.INT
    if annotation is float:
        return click.FLOAT
    return click.STRING


# ---------------------------------------------------------------------------
# Docstring parsing
# ---------------------------------------------------------------------------

def _parse_docstring(docstring: Optional[str]) -> tuple[str, dict[str, str]]:
    """
    Extract summary line and per-parameter help from a docstring.

    Returns:
        (summary, {param_name: help_text})
    """
    if not docstring:
        return "", {}
    lines = docstring.strip().splitlines()
    summary = lines[0].strip() if lines else ""

    param_help: dict[str, str] = {}
    in_args = False
    current_param = None
    for line in lines[1:]:
        stripped = line.strip()
        if stripped.lower().startswith("args:"):
            in_args = True
            continue
        if stripped.lower().startswith(("returns:", "raises:", "examples:", "example:", "note:")):
            in_args = False
            current_param = None
            continue
        if in_args and stripped:
            # Try to match "param_name (type): description" or "param_name: description"
            for sep in [" (", ":"]:
                if sep in stripped:
                    name_part = stripped.split(sep)[0].strip()
                    if name_part.isidentifier():
                        # Extract description after the colon
                        colon_idx = stripped.find(":", len(name_part))
                        if colon_idx >= 0:
                            desc = stripped[colon_idx + 1:].strip()
                            param_help[name_part] = desc
                            current_param = name_part
                        break
            else:
                # Continuation line for current param
                if current_param and stripped:
                    param_help[current_param] += " " + stripped

    return summary, param_help


# ---------------------------------------------------------------------------
# Command factory
# ---------------------------------------------------------------------------

def _make_command(
    method: Callable,
    method_name: str,
    client_factory: Callable,
) -> click.Command:
    """
    Create a Click command from a Python method by introspecting its
    signature, type hints, and docstring.
    """
    sig = inspect.signature(method)
    try:
        hints = typing.get_type_hints(method)
    except Exception:
        hints = {}
    summary, param_help = _parse_docstring(method.__doc__)

    params: list[click.Parameter] = []
    param_names: list[str] = []

    for pname, p in sig.parameters.items():
        if pname == "self":
            continue

        annotation = hints.get(pname, str)
        click_type, is_multiple, is_flag = _python_type_to_click(annotation)
        cli_name = pname.replace("_", "-")
        required = p.default is inspect.Parameter.empty
        default = p.default if p.default is not inspect.Parameter.empty else None
        help_text = param_help.get(pname, "")

        if is_flag:
            params.append(click.Option(
                [f"--{cli_name}/--no-{cli_name}"],
                default=default,
                help=help_text or None,
            ))
        elif is_multiple:
            params.append(click.Option(
                [f"--{cli_name}"],
                type=click_type,
                multiple=True,
                required=required,
                help=help_text or None,
            ))
        else:
            params.append(click.Option(
                [f"--{cli_name}"],
                type=click_type,
                default=default,
                required=required,
                help=help_text or None,
            ))
        param_names.append(pname)

    # Build the callback that runs when the command is invoked
    _method_ref = method
    _param_names = param_names
    _hints = hints

    def callback(**kwargs):
        ctx = click.get_current_context()
        namespace = client_factory(ctx)
        # Build call kwargs: convert tuples→lists, parse JSON dicts, skip None
        call_kwargs = {}
        for pname in _param_names:
            value = kwargs.get(pname)
            if value is None:
                continue
            # Click's multiple=True returns empty tuple when not provided
            if isinstance(value, tuple) and len(value) == 0:
                continue
            ann = _hints.get(pname, str)
            # multiple → list
            if isinstance(value, tuple):
                value = list(value)
                if len(value) == 1 and not _is_list_type(ann):
                    value = value[0]
            # dict type → parse JSON string
            if _is_dict_type(ann) and isinstance(value, str):
                try:
                    value = json.loads(value)
                except json.JSONDecodeError as e:
                    click.echo(f"Error: --{pname.replace('_', '-')} must be valid JSON: {e}", err=True)
                    sys.exit(1)
            call_kwargs[pname] = value

        try:
            result = getattr(namespace, _method_ref.__name__)(**call_kwargs)
            _output(result)
        except Exception as e:
            click.echo(f"Error: {e}", err=True)
            sys.exit(1)

    cmd_name = method_name.replace("_", "-")
    return click.Command(
        name=cmd_name,
        callback=callback,
        params=params,
        help=summary or None,
    )


def _is_list_type(annotation) -> bool:
    """Check if an annotation is a list type."""
    origin = typing.get_origin(annotation)
    if origin is list:
        return True
    # Check inside Optional/Union
    args = typing.get_args(annotation)
    if args:
        return any(_is_list_type(a) for a in args if a is not type(None))
    return False


def _is_dict_type(annotation) -> bool:
    """Check if an annotation is a dict type."""
    if annotation is dict:
        return True
    origin = typing.get_origin(annotation)
    if origin is dict:
        return True
    # Check inside Optional/Union
    args = typing.get_args(annotation)
    if args:
        return any(_is_dict_type(a) for a in args if a is not type(None))
    return False


# ---------------------------------------------------------------------------
# Group factory
# ---------------------------------------------------------------------------

def _make_group(cls: type, group_name: str, client_factory: Callable) -> click.Group:
    """
    Introspect a namespace class and create a Click group with a command
    for each public method.
    """
    group = click.Group(name=group_name, help=cls.__doc__ or f"{group_name} commands")

    for name in sorted(dir(cls)):
        if name.startswith("_"):
            continue
        # Skip properties (like _parent accessors)
        if isinstance(inspect.getattr_static(cls, name), property):
            continue
        obj = getattr(cls, name)
        if not callable(obj):
            continue
        cmd = _make_command(obj, name, client_factory)
        group.add_command(cmd)

    return group


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def _output(result: Any):
    """Format and print a command result as JSON."""
    if isinstance(result, (dict, list)):
        click.echo(json.dumps(result, indent=2, default=str))
    elif result is not None:
        click.echo(result)


# ---------------------------------------------------------------------------
# Client instantiation helpers
# ---------------------------------------------------------------------------

def _get_hub_from_ctx(ctx: click.Context):
    """Lazily create/cache a Hub instance from Click context."""
    obj = ctx.find_root().ensure_object(dict)
    if "hub" not in obj:
        from . import Hub

        # Priority: explicit flags → stored OAuth → COCALC_API_KEY env var
        explicit_api_key = obj.get("api_key")
        explicit_oauth_token = obj.get("oauth_token")
        env_api_key = os.environ.get("COCALC_API_KEY")
        # Host priority: --host flag → COCALC_HOST env → stored auth host → cocalc.com
        from . import auth as _auth
        stored_host = _auth._load_auth().get("host", "")
        host = obj.get("host") or os.environ.get("COCALC_HOST") or stored_host or "https://cocalc.com"

        try:
            if explicit_api_key:
                obj["hub"] = Hub(api_key=explicit_api_key, host=host)
            elif explicit_oauth_token:
                obj["hub"] = Hub(oauth_token=explicit_oauth_token, host=host)
            else:
                # Try stored OAuth first (Hub.__init__ checks get_token()),
                # then fall back to COCALC_API_KEY env var
                try:
                    obj["hub"] = Hub(host=host)
                except ValueError:
                    if env_api_key:
                        obj["hub"] = Hub(api_key=env_api_key, host=host)
                    else:
                        raise
        except ValueError as e:
            click.echo(f"Error: {e}", err=True)
            sys.exit(1)
    return obj["hub"]


def _get_project_from_ctx(ctx: click.Context):
    """Lazily create/cache a Project instance from Click context."""
    obj = ctx.find_root().ensure_object(dict)
    if "project" not in obj:
        from . import Project

        api_key = obj.get("api_key") or os.environ.get("COCALC_API_KEY")
        from . import auth as _auth
        stored_host = _auth._load_auth().get("host", "")
        host = obj.get("host") or os.environ.get("COCALC_HOST") or stored_host or "https://cocalc.com"
        project_id = obj.get("project_id") or os.environ.get("COCALC_PROJECT_ID")
        oauth_token = obj.get("oauth_token")

        if not project_id:
            click.echo("Error: --project-id is required for project commands", err=True)
            sys.exit(1)

        try:
            kwargs: dict[str, Any] = {"project_id": project_id, "host": host}
            if api_key:
                kwargs["api_key"] = api_key
            elif oauth_token:
                kwargs["oauth_token"] = oauth_token
            obj["project"] = Project(**kwargs)
        except ValueError as e:
            click.echo(f"Error: {e}", err=True)
            sys.exit(1)
    return obj["project"]


# ---------------------------------------------------------------------------
# Public builders: assemble the top-level groups
# ---------------------------------------------------------------------------

def build_hub_group() -> click.Group:
    """Build the 'hub' command group with subgroups for each namespace."""
    from .hub import System, Projects, Jupyter, Sync, Database, Messages
    from .org import Organizations

    hub_group = click.Group(name="hub", help="Hub API commands")

    namespaces: dict[str, type] = {
        "system": System,
        "projects": Projects,
        "jupyter": Jupyter,
        "sync": Sync,
        "db": Database,
        "messages": Messages,
        "org": Organizations,
    }

    for ns_name, ns_cls in namespaces.items():
        # Create a closure to capture ns_name correctly
        def make_factory(attr_name):
            def factory(ctx):
                hub = _get_hub_from_ctx(ctx)
                return getattr(hub, attr_name)
            return factory

        sub_group = _make_group(ns_cls, ns_name, make_factory(ns_name))
        hub_group.add_command(sub_group)

    return hub_group


def build_project_group() -> click.Group:
    """Build the 'project' command group (flat — methods are direct subcommands)."""
    from .project import System as ProjectSystem

    def factory(ctx):
        project = _get_project_from_ctx(ctx)
        return project.system

    return _make_group(ProjectSystem, "project", factory)


def build_org_group() -> click.Group:
    """Build the top-level 'org' shortcut (aliases hub org)."""
    from .org import Organizations

    def factory(ctx):
        hub = _get_hub_from_ctx(ctx)
        return hub.org

    return _make_group(Organizations, "org", factory)

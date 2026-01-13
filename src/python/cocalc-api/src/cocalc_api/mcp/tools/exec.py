"""
Execute shell commands in CoCalc project.

Provides the 'exec' tool that allows running arbitrary shell commands
in the target CoCalc project environment.
"""

from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    pass


def register_exec_tool(mcp) -> None:
    """Register the exec tool with the given FastMCP instance."""

    @mcp.tool()
    async def exec(
        command: str,
        args: Optional[list[str]] = None,
        bash: bool = False,
        timeout: Optional[int] = None,
        cwd: Optional[str] = None,
    ) -> str:
        """
        Execute shell commands in a CoCalc project environment.

        A CoCalc project is a containerized Linux environment (Ubuntu-based) where you can run
        arbitrary command-line tools and scripts. This tool is best for system operations,
        installing packages, and running compiled programs. For executing Python, R, or Julia code
        with rich output (plots, dataframes, etc.), use the jupyter_execute tool instead.

        This tool allows you to execute any shell command available in that environment, including:
        - System utilities (grep, awk, sed, find, ls, etc.)
        - Development tools (git, npm, pip, cargo, etc.)
        - Data processing tools (bc, jq, imagemagick, etc.)
        - Custom scripts and compiled programs
        - Package management and environment setup

        The command executes in the project's Linux shell environment with access to the
        project's file system and all installed packages/tools.

        Common use cases:
        - List available Jupyter kernels: exec(command="jupyter kernelspec list")
        - Install packages: exec(command="pip", args=["install", "pandas"])
        - Setup Jupyter kernel: exec(command="python3", args=["-m", "ipykernel", "install", "--user", "--name=python3", "--display-name=Python 3"])
        - Git operations: exec(command="git", args=["status"])
        - File operations: exec(command="find", args=[".", "-name", "*.py"])
        - Execute complex pipelines: exec(command="cat data.txt | grep pattern | wc -l", bash=True)

        Args:
            command: The command to execute (e.g., 'ls -la', 'python script.py', 'echo 2 + 3 | bc')
            args: Optional list of arguments to pass to the command
            bash: If true, interpret command as a bash script (enables pipes, redirects, etc.)
            timeout: Timeout in seconds for command execution
            cwd: Working directory (relative to home or absolute)

        Returns:
            A string containing stdout, stderr, and exit code information
        """
        from ..mcp_server import get_project_client

        try:
            project = get_project_client()
            result = project.system.exec(
                command=command,
                args=args,
                bash=bash,
                timeout=timeout,
                cwd=cwd,
            )

            output = f"stdout:\n{result['stdout']}\n\nstderr:\n{result['stderr']}\n\nexit_code: {result['exit_code']}"
            return output

        except RuntimeError as e:
            error_msg = str(e)
            if "No current project set" in error_msg or "project_id" in error_msg:
                return "Error: No project set. Use set_current_project(project_id) to select a project first."
            return f"Error executing command: {error_msg}"
        except Exception as e:
            return f"Error executing command: {str(e)}"

"""
File listing resource for CoCalc projects.

Provides the 'project-files' resource that allows browsing and listing
files in the project directory structure. This resource helps LLMs discover
and understand the contents of the CoCalc project filesystem.
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass


def register_file_listing_resource(mcp) -> None:
    """Register the file listing resource with the given FastMCP instance."""

    @mcp.resource("cocalc://project-files")
    async def project_files() -> str:
        """
        Browse and list files in the CoCalc project home directory.

        Use this resource when you need to:
        - Explore the project layout and understand what files exist
        - Locate specific files by name or type
        - Understand the overall project organization before making changes
        - Determine which files you need to examine or modify
        - Check file sizes to understand project scope

        This lists immediate children (files and directories) in the project home directory,
        showing their type and size. Use the exec tool with 'find' or 'ls -R' to
        get recursive directory listings or more detailed information about subdirectories.

        Returns:
            Formatted listing with:
            - [FILE] or [DIR] indicator
            - Item name
            - Size in bytes
        """
        from ..mcp_server import get_project_client

        try:
            project = get_project_client()
            # Use the exec tool to list files with basic information
            result = project.system.exec(
                command="find . -maxdepth 1 \\( -type f -o -type d \\) -printf '%f %s %T@ %y\\n' 2>/dev/null | sort",
                bash=True,
            )

            if result["exit_code"] != 0:
                return f"Error listing files: {result['stderr']}"

            files_output = result["stdout"].strip()
            if not files_output:
                return "No files found in project home directory"

            # Format the output
            lines = files_output.split('\n')
            formatted_lines = []
            for line in lines:
                if not line.strip():
                    continue
                parts = line.split()
                if len(parts) >= 4:
                    name, size, _, ftype = parts[0], parts[1], parts[2], parts[3]
                    file_type_str = "[DIR]" if ftype == "d" else "[FILE]"
                    formatted_lines.append(f"{file_type_str} {name:30} {size:>10} bytes")

            if not formatted_lines:
                return "No files found in project home directory"

            header = "Files in project home directory:\n" + "=" * 60 + "\n"
            return header + "\n".join(formatted_lines)

        except RuntimeError as e:
            error_msg = str(e)
            if "No current project set" in error_msg or "project_id" in error_msg:
                return "Error: No project set. Use set_current_project(project_id) to select a project first."
            return f"Error listing files: {error_msg}"
        except Exception as e:
            return f"Error listing files: {str(e)}"

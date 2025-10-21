"""
File listing resource for CoCalc projects.

Provides the 'project-files' resource that allows browsing and listing
files in the project directory structure with filtering and pagination.
"""

from typing import Any, Optional, cast
from datetime import datetime
from urllib.parse import urlparse, parse_qs

from mcp.types import TextResourceContents, ReadResourceResult
from pydantic.networks import AnyUrl


class ProjectFilesResource:
    """Resource for listing and browsing project files."""

    def __init__(self, project_client):
        """
        Initialize the project files resource.

        Args:
            project_client: Initialized Project client from cocalc_api
        """
        self.project_client = project_client

    def uri_template(self) -> str:
        """Return the URI template for this resource."""
        return "cocalc://project-files/{path}"

    def description(self) -> str:
        """Return the resource description."""
        return (
            "Browse and list files in the CoCalc project. "
            "Supports glob filtering and pagination. "
            "Query parameters: glob=*.py (filter), limit=100 (max results), recurse=true (recursive)"
        )

    async def read(self, uri: str) -> ReadResourceResult:
        """
        Read and list files from the project.

        Args:
            uri: Resource URI like cocalc://project-files/path?glob=*.py&limit=100

        Returns:
            ReadResourceResult with file listing
        """
        try:
            # Parse URI
            parsed = urlparse(uri)
            path = parsed.path.replace("project-files/", "").lstrip("/") or "."

            # Parse query parameters
            query = parse_qs(parsed.query)
            glob_pattern = query.get("glob", [None])[0]
            limit = int(query.get("limit", [100])[0]) if query.get("limit") else 100
            recurse_str = query.get("recurse", [False])[0]
            recurse = recurse_str.lower() == "true" if isinstance(recurse_str, str) else False

            # TODO: Implement file listing logic
            # This is a placeholder that will be implemented in the next phase
            files_info = self._list_files(path, glob_pattern, limit, recurse)

            content = self._format_files_output(files_info, uri)

            return ReadResourceResult(
                contents=[TextResourceContents(uri=cast(AnyUrl, uri), text=content)]
            )

        except Exception as e:
            return ReadResourceResult(
                contents=[
                    TextResourceContents(
                        uri=cast(AnyUrl, uri),
                        text=f"Error listing files: {str(e)}",
                    )
                ]
            )

    def _list_files(
        self, path: str, glob_pattern: Optional[str], limit: int, recurse: bool
    ) -> list[dict[str, Any]]:
        """
        List files in the given path.

        Args:
            path: Directory path to list
            glob_pattern: Optional glob pattern to filter files (case-insensitive)
            limit: Maximum number of files to return
            recurse: Whether to recursively list subdirectories

        Returns:
            List of file information dictionaries with keys: name, path, type, size, modified

        Notes:
            - Glob patterns are case-insensitive (e.g., "*.py", "*.PY", "*.Py" all match)
            - Uses find -iname for case-insensitive matching on Unix/Linux systems
        """
        try:
            # Build find command
            depth_opt = "" if recurse else "-maxdepth 1"
            # Use -iname for case-insensitive glob pattern matching
            glob_opt = f"-iname '{glob_pattern}'" if glob_pattern else ""

            # Use find with -printf for structured output
            # Format: filename|type|size|mtime
            # where type is 'f' for file or 'd' for directory
            cmd = f"find {path} {depth_opt} -type f -o -type d"
            if glob_pattern:
                cmd = f"find {path} {depth_opt} {glob_opt} -type f -o {glob_opt} -type d"

            cmd += " -printf '%P|%y|%s|%T@\\n' 2>/dev/null | head -n {limit}".format(limit=limit)

            result = self.project_client.system.exec(command=cmd, bash=True)

            if result['exit_code'] != 0:
                return []

            files_info: list[dict[str, Any]] = []
            for line in result['stdout'].strip().split('\n'):
                if not line:
                    continue

                try:
                    parts = line.split('|')
                    if len(parts) < 4:
                        continue

                    filename, file_type, size_str, mtime_str = parts[0], parts[1], parts[2], parts[3]

                    # Skip the root directory entry (empty filename with type 'd')
                    if not filename and file_type == 'd':
                        continue

                    try:
                        size = int(size_str) if size_str else 0
                    except ValueError:
                        size = 0

                    try:
                        mtime_float = float(mtime_str)
                        modified = datetime.fromtimestamp(mtime_float).isoformat() + 'Z'
                    except (ValueError, OverflowError):
                        modified = "unknown"

                    files_info.append({
                        'name': filename.split('/')[-1] if filename else path,
                        'path': filename if filename else path,
                        'type': 'directory' if file_type == 'd' else 'file',
                        'size': size,
                        'modified': modified,
                    })

                    if len(files_info) >= limit:
                        break
                except (IndexError, ValueError):
                    # Skip malformed lines
                    continue

            return files_info

        except Exception:
            # Return empty list on error (error will be shown in read() method)
            return []

    def _format_files_output(self, files_info: list[dict[str, Any]], uri: str) -> str:
        """
        Format file information for output.

        Args:
            files_info: List of file information
            uri: The requested URI

        Returns:
            Formatted text output
        """
        if not files_info:
            return f"No files found for {uri}"

        output = f"Files in {uri}:\n\n"
        for file_info in files_info:
            file_type = "[DIR]" if file_info["type"] == "directory" else "[FILE]"
            output += f"{file_type} {file_info['path']} ({file_info['size']} bytes)\n"

        return output

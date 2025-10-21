"""
MCP Resources for CoCalc API.

Resources provide information that the LLM can read about the CoCalc project.
"""

from .file_listing import ProjectFilesResource

__all__ = ["ProjectFilesResource"]

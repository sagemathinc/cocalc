all: install build-docs

install:
	uv --version >/dev/null 2> /dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
	uv sync --dev
	uv pip install -e .

check:
	uv run ruff check src/
	uv run mypy src/

serve-docs:
	uv run mkdocs serve

build-docs: install
	uv run mkdocs build

clean:
	rm -rf dist build *.egg-info site
	find . -name "__pycache__" -type d -exec rm -rf {} +

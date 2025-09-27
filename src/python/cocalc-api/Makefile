all: install build-docs

install:
	uv --version >/dev/null 2> /dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
	uv sync --dev
	uv pip install -e .

format:
	uv run yapf --in-place --recursive src/

check:
	uv run ruff check src/
	uv run mypy src/
	uv run pyright src/

serve-docs:
	uv run mkdocs serve

build-docs: install
	uv run mkdocs build

publish: install
	uv build
	uv publish

clean:
	rm -rf dist build *.egg-info site
	find . -name "__pycache__" -type d -exec rm -rf {} +

all: install build-docs

install:
	uv --version >/dev/null 2> /dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
	uv sync --dev
	uv pip install -e .

format:
	uv run yapf --in-place --recursive src/ tests/

check:
	uv run ruff check src/ tests/
	uv run mypy src/ tests/
	uv run pyright src/ tests/

test:
	uv run pytest

test-verbose:
	uv run pytest -v

serve-docs:
	uv run mkdocs serve

build-docs: install
	uv run mkdocs build

publish: install
	uv build
	uv publish

clean:
	rm -rf dist build *.egg-info site .pytest_cache
	find . -name "__pycache__" -type d -exec rm -rf {} +
	find . -name "*.pyc" -delete

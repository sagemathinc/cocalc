all: install build-docs

help:
	@echo "Available targets:"
	@echo "  install          - Install project dependencies"
	@echo "  format           - Format code using yapf"
	@echo "  check            - Run linting and type checking"
	@echo "  test             - Run tests"
	@echo "  test-verbose     - Run tests with verbose output"
	@echo "  coverage         - Run tests with coverage reporting (HTML + terminal)"
	@echo "  coverage-report  - Show coverage report in terminal"
	@echo "  coverage-html    - Generate HTML coverage report only"
	@echo "  serve-docs       - Serve documentation locally"
	@echo "  build-docs       - Build documentation"
	@echo "  publish          - Build and publish package"
	@echo "  clean            - Clean build artifacts and cache files"

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

coverage:
	uv run pytest --cov=src --cov-report=term-missing --cov-report=html

coverage-report:
	uv run coverage report

coverage-html:
	uv run coverage html

serve-docs:
	uv run mkdocs serve

build-docs: install
	uv run mkdocs build

publish: install
	uv build
	uv publish

clean:
	rm -rf dist build *.egg-info site .pytest_cache htmlcov .coverage
	find . -name "__pycache__" -type d -exec rm -rf {} +
	find . -name "*.pyc" -delete

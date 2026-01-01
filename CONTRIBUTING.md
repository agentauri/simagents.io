# Contributing to Agents City

Thank you for your interest in contributing to Agents City! This document provides guidelines and information for contributors.

## Philosophy

Before contributing, please understand our core philosophy:

**Radical Emergence**: Only survival mechanics are imposed by the system. Everything else—governance, economy, reputation, social structures—must emerge from agent interactions. We do not add centralized databases for reputation tracking, crime logs, or justice systems.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- [Docker](https://docker.com) (for PostgreSQL and Redis)
- Node.js 18+ (for frontend tooling)

### Setup

```bash
# Clone the repository
git clone https://github.com/agentscity/agentscity.io.git
cd agentscity.io

# Install dependencies
bun install

# Copy environment file
cp .env.example apps/server/.env

# Start Docker services
docker-compose up -d

# Initialize database
cd apps/server && bunx drizzle-kit push

# Start development servers
bun dev
```

### Test Mode

For development without LLM API keys:

```bash
TEST_MODE=true bun dev:server
```

This uses fallback decision logic instead of calling LLM APIs.

## How to Contribute

### Reporting Bugs

1. Check existing issues to avoid duplicates
2. Use the bug report template
3. Include:
   - Clear description of the issue
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Bun version, etc.)

### Suggesting Features

1. Read the [PRD](docs/PRD.md) to understand the project vision
2. Ensure the feature aligns with the "Radical Emergence" philosophy
3. Open an issue with the feature request template

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Ensure code follows existing patterns
5. Test your changes locally
6. Commit with clear messages
7. Push to your fork
8. Open a Pull Request

### Commit Messages

Follow conventional commits:

```
feat: add new action type for agent communication
fix: resolve SSE connection issue on Safari
docs: update API documentation
refactor: simplify tick engine logic
```

## Code Style

- TypeScript for all code
- Use existing patterns in the codebase
- Keep functions small and focused
- Avoid adding unnecessary abstractions
- No hardcoded secrets or credentials

## Architecture Guidelines

### Backend (apps/server)

- Actions go in `src/actions/handlers/`
- LLM adapters go in `src/llm/adapters/`
- Database queries go in `src/db/queries/`
- Use Drizzle ORM for database operations

### Frontend (apps/web)

- Components go in `src/components/`
- Zustand stores go in `src/stores/`
- Custom hooks go in `src/hooks/`
- Use TailwindCSS for styling

## Testing

```bash
# Run backend tests
cd apps/server && bun test

# Run in test mode (no LLM calls)
TEST_MODE=true bun dev:server
```

## Questions?

- Open an issue for questions
- Read the [PRD](docs/PRD.md) for detailed specifications
- Check [CLAUDE.md](CLAUDE.md) for codebase guidance

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

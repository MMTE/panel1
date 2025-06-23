# Contributing to Panel1

Thank you for your interest in contributing to Panel1! We welcome contributions from developers of all skill levels.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- Git
- Basic knowledge of TypeScript, React, and tRPC

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/panel1.git
   cd panel1
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up your environment**
   ```bash
   cp .env.example .env
   # Edit .env with your local database credentials
   ```

4. **Initialize the database**
   ```bash
   cd apps/api
   npx prisma migrate dev
   npx prisma generate
   ```

5. **Start development servers**
   ```bash
   npm run dev
   ```

## 📋 How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/panel1-org/panel1/issues)
2. If not, create a new issue using the bug report template
3. Provide as much detail as possible, including:
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version, etc.)
   - Screenshots if applicable

### Suggesting Features

1. Check [Discussions](https://github.com/panel1-org/panel1/discussions) for existing feature requests
2. Create a new discussion or issue using the feature request template
3. Clearly describe:
   - The problem you're trying to solve
   - Your proposed solution
   - Any alternatives you've considered

### Code Contributions

#### Branch Naming Convention

- `feat/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Adding or updating tests

#### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(billing): add stripe webhook handler
fix(auth): resolve JWT token expiration issue
docs(api): update tRPC router documentation
```

#### Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes**
   - Write clean, readable code
   - Follow existing code style and patterns
   - Add tests for new functionality
   - Update documentation if needed

3. **Test your changes**
   ```bash
   npm run test
   npm run lint
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

5. **Push to your fork**
   ```bash
   git push origin feat/your-feature-name
   ```

6. **Create a Pull Request**
   - Use the PR template
   - Link related issues
   - Provide clear description of changes
   - Add screenshots for UI changes

## 🏗️ Project Structure

```
panel1/
├── apps/
│   ├── api/              # tRPC backend
│   │   ├── src/
│   │   │   ├── modules/  # Feature modules
│   │   │   ├── trpc/     # tRPC routers
│   │   │   └── db/       # Database utilities
│   │   └── prisma/       # Database schema
│   └── web/              # React frontend
│       └── src/
│           ├── pages/    # Route components
│           ├── components/ # Reusable components
│           └── api/      # tRPC client
├── packages/
│   ├── shared-types/     # Shared TypeScript types
│   └── plugin-sdk/       # Plugin development kit
└── docs/                 # Documentation
```

## 🧪 Testing

- **Unit Tests**: Use Vitest for frontend, Jest for backend
- **Integration Tests**: Test API endpoints and database operations
- **E2E Tests**: Use Playwright for critical user flows

```bash
# Run all tests
npm run test

# Run tests for specific workspace
cd apps/api && npm run test
cd apps/web && npm run test
```

## 📝 Code Style

- **TypeScript**: Strict mode enabled
- **ESLint**: Follow the configured rules
- **Prettier**: Code formatting (run `npm run format`)
- **File Naming**: Use kebab-case for files, PascalCase for components

## 🔧 Development Guidelines

### Backend (tRPC + Prisma)

- Use Zod for input validation
- Follow the module-based architecture
- Write type-safe database queries
- Handle errors gracefully with proper HTTP status codes

### Frontend (React + TypeScript)

- Use functional components with hooks
- Implement proper error boundaries
- Follow the component composition pattern
- Use Tailwind CSS for styling

### Database

- Use Prisma migrations for schema changes
- Follow naming conventions (snake_case for database, camelCase for TypeScript)
- Add proper indexes for performance
- Include seed data for development

## 🌟 Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes for significant contributions
- Annual contributor highlights

## 📞 Getting Help

- **Discord**: Join our [Discord server](https://discord.gg/panel1)
- **Discussions**: Use [GitHub Discussions](https://github.com/panel1-org/panel1/discussions)
- **Issues**: Create an issue for bugs or feature requests

## 📄 License

By contributing to Panel1, you agree that your contributions will be licensed under the MIT License.

---

Thank you for helping make Panel1 better! 🚀
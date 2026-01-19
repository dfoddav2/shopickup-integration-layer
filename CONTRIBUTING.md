# Contributing to Shopickup

Thank you for your interest in contributing to Shopickup! This document explains how to set up your development environment, build the project, run tests, and contribute new features or adapters.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Development Environment Setup](#development-environment-setup)
3. [Project Structure](#project-structure)
4. [Build System Overview](#build-system-overview)
5. [Running Tests](#running-tests)
6. [Adding a New Adapter](#adding-a-new-adapter)
7. [Code Style & Standards](#code-style--standards)
8. [Submitting Changes](#submitting-changes)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js** 18+ (v20 LTS recommended)
- **pnpm** 8+
- **Git**
- Basic knowledge of TypeScript and async/await
- Familiarity with carrier APIs or REST concepts

### Installation

```bash
# Install Node.js (macOS with Homebrew)
brew install node@20

# Install pnpm globally
npm install -g pnpm

# Verify installation
node --version  # v20.x.x
pnpm --version  # 8.x.x or higher
```

---

## Development Environment Setup

### 1. Clone & Install

```bash
# Clone the repository
git clone https://github.com/anomalyco/shopickup-integration-layer.git
cd shopickup-integration-layer

# Install dependencies (installs all workspaces)
pnpm install
```

### 2. Verify Setup

```bash
# Build all packages
pnpm run build

# Run all tests
pnpm run test

# Should see: 22 passing tests (Foxpost adapter)
```

If you see all tests passing, your environment is ready!

### 3. IDE Configuration (VS Code)

```json
// .vscode/settings.json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  }
}
```

---

## Project Structure

```
shopickup-integration-layer/
├── packages/
│   ├── core/                    # Main library (canonical types, interfaces)
│   │   ├── src/
│   │   │   ├── types/           # Domain model (Address, Shipment, Parcel, etc.)
│   │   │   ├── interfaces/      # CarrierAdapter, Store, Logger, etc.
│   │   │   ├── errors/          # CarrierError, structured errors
│   │   │   ├── stores/          # InMemoryStore implementation
│   │   │   ├── flows/           # Orchestration helpers (executeCreateLabelFlow)
│   │   │   └── index.ts         # Main exports
│   │   ├── dist/                # Compiled output (generated, not committed)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── adapters/
│       └── foxpost/             # First carrier adapter (reference implementation)
│           ├── src/
│           │   ├── index.ts     # FoxpostAdapter class
│           │   ├── client.ts    # Thin HTTP wrapper
│           │   ├── mapper.ts    # Bidirectional type mapping
│           │   ├── types.ts     # Re-exported types from gen/
│           │   └── tests/       # Test files (run from root)
│           ├── gen/             # Generated types from OpenAPI (gitignored)
│           ├── dist/            # Compiled output (generated, not committed)
│           ├── package.json
│           ├── tsconfig.json
│           └── README.md
│
├── carrier-docs/
│   └── canonical/
│       └── foxpost.yaml         # OpenAPI spec for Foxpost API
│
├── examples/                     # Example usage and dev server (WIP)
├── tools/                        # CLI generators and utilities
│
├── package.json                 # Root workspaces manifest
├── tsconfig.json               # Shared TypeScript config (ESM, NodeNext)
├── vitest.config.ts            # Vitest test runner config (v8 coverage)
│
├── README.md                    # Project overview
├── ARCHITECTURE.md             # Architecture decisions
├── ADAPTER_DEVELOPMENT.md      # Step-by-step adapter creation guide
├── AGENTS.md                   # Implementation guidance for AI agents
└── CONTRIBUTING.md             # This file
```

---

## Build System Overview

### Key Technologies

- **Language:** TypeScript 5.4 (strict mode)
- **Module System:** ESM (import/export)
- **Module Resolution:** NodeNext (Node.js native ESM)
- **Build Tool:** TypeScript compiler (tsc)
- **Test Runner:** Vitest 4 (v8 coverage included)
- **Package Manager:** pnpm workspaces

### Build-First Workflow

Shopickup uses a **build-first workflow**:

1. **TypeScript compiles to `dist/`** with full type declarations
2. **Tests run against compiled code** (not source)
3. **IDE resolution uses `dist/` types** (same as consumers)

This ensures that:
- Tests verify the same code that will be published
- All TypeScript errors are caught at build time
- Module paths are validated (import errors surface immediately)

### Commands

```bash
# Build all packages
pnpm run build

# Build specific package
cd packages/core && pnpm run build

# Clean dist/ directories
pnpm run clean  # (if configured)

# Watch mode (rebuild on file changes)
pnpm run build -- --watch
```

---

## Running Tests

### Quick Start

```bash
# Run all tests (monorepo)
pnpm run test

# Run with file watch (auto-rerun)
pnpm run test -- --watch

# Run with coverage report
pnpm run test:coverage
```

### Run Specific Tests

```bash
# Run adapter-specific tests
pnpm run test -- foxpost

# Run mapper tests only
pnpm run test -- mapper.spec.ts

# Run integration tests only
pnpm run test -- integration.spec.ts

# Run with grep filter
pnpm run test -- --grep "should map"
```

### Coverage Reports

```bash
# Generate coverage report (HTML in ./coverage)
pnpm run test:coverage

# Open coverage report
open coverage/index.html
```

### Test Files & Organization

- **Unit tests**: `src/tests/mapper.spec.ts` — Test mapping logic without HTTP
- **Integration tests**: `src/tests/integration.spec.ts` — Full workflows with mock HTTP client
- **Test naming**: Use `.spec.ts` or `.test.ts` suffix

### Example Test

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { FoxpostAdapter } from "../index.js";

describe("FoxpostAdapter", () => {
  let adapter: FoxpostAdapter;

  beforeAll(() => {
    adapter = new FoxpostAdapter("https://api.example.com");
  });

  it("should implement CarrierAdapter interface", () => {
    expect(adapter.id).toBe("foxpost");
    expect(adapter.capabilities).toContain("CREATE_LABEL");
  });
});
```

---

## Adding a New Adapter

See [ADAPTER_DEVELOPMENT.md](./ADAPTER_DEVELOPMENT.md) for complete step-by-step guide. Quick overview:

### 1. Create OpenAPI Spec

```bash
# Create carrier-docs/canonical/<carrier>.yaml
# Document the carrier's API with x-capabilities
```

### 2. Scaffold Package

```bash
mkdir -p packages/adapters/<carrier>/src/tests
cd packages/adapters/<carrier>
```

### 3. Implement Adapter

```typescript
// src/index.ts
import { CarrierAdapter, Capability } from "@shopickup/core";

export class <CarrierAdapter> implements CarrierAdapter {
  readonly id = "<carrier>";
  readonly displayName = "Carrier Name";
  readonly capabilities: Capability[] = [
    "CREATE_LABEL",
    // ... other capabilities
  ];

  async createLabel(parcelId: string, ctx: AdapterContext) {
    // Implement label creation
  }
}
```

### 4. Write Tests

Create `src/tests/mapper.spec.ts` and `src/tests/integration.spec.ts` with at least:
- Unit tests for all mapper functions
- Integration tests for all implemented capabilities
- Error handling tests

### 5. Build & Test

```bash
# From root
pnpm run build
pnpm run test
```

### 6. Verify Checklist

- [x] All imports use `.js` extensions (ESM)
- [x] `package.json` has `"type": "module"`
- [x] `tsconfig.json` extends root config
- [x] All tests passing
- [x] No TypeScript errors
- [x] README with carrier-specific notes
- [x] Coverage report (optional but recommended)

---

## Code Style & Standards

### TypeScript

- **Strict mode enabled** — `strict: true` in all tsconfigs
- **No `any` types** — Use proper types or `unknown` with guards
- **Explicit return types** — All functions must declare return types
- **JSDoc comments** — Public APIs must have documentation

```typescript
// Good
/**
 * Creates a shipping label for the given parcel.
 * 
 * @param parcelId - Carrier parcel identifier
 * @param ctx - Adapter context with HTTP client
 * @returns Promise resolving to label resource
 */
export async function createLabel(
  parcelId: string,
  ctx: AdapterContext
): Promise<CarrierResource & { labelUrl?: string }> {
  // Implementation
}

// Bad
export function createLabel(parcelId, ctx) {
  // Missing type annotations and JSDoc
}
```

### Imports

- **Always use `.js` extensions** for relative imports (ESM requirement)
- **Group imports**: external > internal > types
- **Use path aliases** from tsconfig (e.g., `@shopickup/core`)

```typescript
// Good
import axios from "axios";
import { CarrierAdapter } from "@shopickup/core";
import { mapToFoxpost } from "./mapper.js";
import type { CreateShipmentRequest } from "./types.js";

// Bad
import axios from "axios";
import mapToFoxpost from "./mapper";  // Missing .js extension
import { CarrierAdapter } from "../../../packages/core/src";  // Should use alias
```

### Naming Conventions

| What | Convention | Example |
|------|-----------|---------|
| Classes | PascalCase | `FoxpostAdapter` |
| Functions | camelCase | `createLabel()` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_ATTEMPTS` |
| Types | PascalCase | `CreateLabelRequest` |
| Interfaces | PascalCase with I prefix optional | `CarrierAdapter` (no I) |
| Private props | `private` keyword + camelCase | `private baseUrl` |

### Error Handling

Always translate carrier errors to `CarrierError`:

```typescript
try {
  const res = await ctx.http!.post("/labels", payload);
  return { carrierId: res.id, status: "created", raw: res };
} catch (err) {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    
    if (status === 400) {
      throw new CarrierError("Validation failed", "Validation", { raw: err.response?.data });
    } else if (status === 429) {
      throw new CarrierError("Rate limited", "RateLimit", { raw: err.response?.data });
    } else if (status && status >= 500) {
      throw new CarrierError("Server error", "Transient", { raw: err.response?.data });
    }
  }
  
  throw new CarrierError("Network error", "Transient", { raw: err });
}
```

### Logging

Use structured logging with context:

```typescript
// Good
ctx.logger?.debug("Creating label", { parcelId, format: "PDF" });
ctx.logger?.info("Label created", { trackingNumber: res.trackingNumber });
ctx.logger?.error("Label creation failed", { parcelId, error: err.message });

// Bad
ctx.logger?.log("Creating label");  // No context
ctx.logger?.log(res);                // Logging entire object
```

---

## Submitting Changes

### Commit Messages

Follow conventional commit format:

```
type(scope): subject

body (optional)

footer (optional)
```

**Types:**
- `feat` — New feature
- `fix` — Bug fix
- `docs` — Documentation only
- `test` — Tests only
- `refactor` — Code refactoring
- `chore` — Build, dependencies, etc.

**Examples:**
```
feat(foxpost): add TRACK capability support

Implemented tracking status normalization and added 5 integration tests.

Closes #42
```

```
fix(core): handle null labelUrl in CarrierResource
```

### Creating a Pull Request

1. **Fork the repository** and create a feature branch
   ```bash
   git checkout -b feat/my-new-adapter
   ```

2. **Make your changes** and verify
   ```bash
   pnpm run build    # Compile
   pnpm run test     # All tests pass
   ```

3. **Push to your fork**
   ```bash
   git push origin feat/my-new-adapter
   ```

4. **Open a PR** with:
   - Clear title describing the change
   - Description of what you added/fixed
   - Link to related issues
   - Checklist items (see below)

### PR Checklist

- [ ] All tests passing (`pnpm run test`)
- [ ] No TypeScript errors (`pnpm run build`)
- [ ] Code follows style guidelines
- [ ] New tests added (if applicable)
- [ ] Documentation updated (README, JSDoc, etc.)
- [ ] Commit messages follow conventional format
- [ ] No debug code or console.log statements left

### Code Review Process

All PRs require review before merging:

1. Automated checks must pass (build, tests, linting)
2. At least one maintainer approval
3. All conversations resolved
4. Commits squashed if needed

---

## Troubleshooting

### Build Fails with "Cannot find module"

**Cause:** Missing `.js` extension on relative import

```typescript
// ❌ Wrong
import { foo } from "./utils";

// ✅ Correct
import { foo } from "./utils.js";
```

**Fix:** Add `.js` extension to all relative imports

### Tests Fail: "Module not found"

**Cause:** Tests run against `dist/` but code wasn't compiled

```bash
# Solution: always build first
pnpm run build
pnpm run test
```

### Type Errors in IDE but Tests Pass

**Cause:** IDE using different TypeScript config

**Fix:**
1. Check VS Code is using workspace TypeScript: `Cmd+Shift+P` → "TypeScript: Select TypeScript Version"
2. Ensure `.vscode/settings.json` has `typescript.tsdk` configured
3. Reload window: `Cmd+K Cmd+W` then reopen

### Tests Hang or Timeout

**Cause:** Mock server didn't start or HTTP client is stuck

**Fix:**
1. Check if port 3456 is already in use: `lsof -i :3456`
2. Kill process if needed: `kill -9 <pid>`
3. Increase test timeout: `it("test", () => { ... }, { timeout: 10000 })`

### pnpm install Fails

**Cause:** Missing or incompatible Node version

**Fix:**
```bash
node --version  # Should be 18+
pnpm --version  # Should be 8+

# If versions wrong, update
brew install node@20
npm install -g pnpm@latest
```

### Coverage Report is Empty

**Cause:** Tests didn't run or coverage collection failed

**Fix:**
```bash
# Run with explicit coverage
pnpm run test:coverage

# Or run tests first, then generate coverage
pnpm run test
pnpm run test:coverage
```

---

## Getting Help

- **Questions:** Open a [GitHub discussion](https://github.com/anomalyco/shopickup-integration-layer/discussions)
- **Bugs:** File an [issue](https://github.com/anomalyco/shopickup-integration-layer/issues)
- **Feedback:** Use the [feedback form](https://github.com/anomalyco/opencode) (if using OpenCode)

---

## Additional Resources

- [ADAPTER_DEVELOPMENT.md](./ADAPTER_DEVELOPMENT.md) — Step-by-step adapter creation
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Design decisions and patterns
- [AGENTS.md](./AGENTS.md) — Implementation guidance for AI agents
- [README.md](./README.md) — Project overview

---

Thank you for contributing! 🚀

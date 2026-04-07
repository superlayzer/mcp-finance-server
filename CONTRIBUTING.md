# Contributing

Thanks for your interest in contributing!

## Prerequisites

- Node.js 20+
- npm (or pnpm/yarn)

## Local development

```bash
npm install
npm run dev
```

Server starts at http://localhost:3004/mcp.

## Adding a new tool

1. Create `src/tools/my-tool.ts` following the pattern in existing tool files
2. Export a `registerMyTool(server: McpServer)` function
3. Import and call it in `src/app.ts`
4. Run `npm run typecheck` to verify

See README.md for a detailed tutorial.

## Code style

- TypeScript strict mode
- Widget HTML uses vanilla JS (ES5) for sandboxed iframe compatibility
- Use `as const` for MCP content type literals

## Submitting a PR

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Run `npm run typecheck`
5. Open a pull request

## Note

Source of truth is the [Layzer monorepo](https://github.com/superlayzer/layzer). Small fixes welcome here; features should go upstream.

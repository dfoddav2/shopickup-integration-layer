# Adapter README Standard

Use this template for every adapter package README under `packages/adapters/<carrier>/README.md`.

## Required Sections

1. `# @shopickup/adapters-<carrier>`
2. `Metadata`
3. `What it does`
4. `Install`
5. `Quick start`
6. `Status`

## Metadata

Include these fields near the top of the README:

- `Last updated`: UTC timestamp in `YYYY-MM-DDTHH:MM:SSZ` format.
- `Carrier API version`: the upstream API version the adapter currently targets.

## Content Rules

- Keep `What it does` as a short capability list.
- Mention credential requirements explicitly.
- Keep the quick start example minimal and real.
- Keep status notes short; prefer package-state facts over marketing text.
- Link to the monorepo issue tracker and repository when useful, but do not repeat large amounts of project-level documentation.

## Example

```md
# @shopickup/adapters-example

## Metadata

- Last updated: 2026-05-22T10:48:46Z
- Carrier API version: 1.2.14

## What it does

- `CREATE_LABEL`
```

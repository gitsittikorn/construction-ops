# Editor setup

Open the repository folder in VS Code and install the workspace recommendations.
The workspace uses Prettier for formatting and ESLint for code diagnostics and
safe fixes on explicit saves. This follows the tools' documented integration:

- https://prettier.io/docs/editors/
- https://typescript-eslint.io/docs/
- https://react.dev/reference/eslint-plugin-react-hooks

## Shared conventions

- UTF-8, LF newlines, two spaces and a final newline via `.editorconfig` and VS Code.
- `.gitattributes` keeps text files on LF in Git, with CRLF for Windows batch files.
- Existing Prettier conventions: single quotes, trailing commas and 100-column width.
- ESLint flat config with JavaScript and TypeScript recommended rules.
- React Hooks call-order errors and dependency warnings.
- `eslint-config-prettier` disables lint rules that conflict with formatting.
- Unused variables are warnings during adoption; intentionally unused names use `_`.
- Explicit `any` remains an error in application code and a warning in tests.
- Empty catch blocks are allowed; other empty blocks remain errors.
- Preserving caught error causes is a warning during adoption.

Use `npm run lint`, `npm run lint:fix`, `npm run format` and `npm run check`.
On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.
Warnings remain visible and should be reviewed; a passing check does not mean that
the legacy warning backlog has been resolved.

Vitest uses at most two workers to bound jsdom memory/CPU pressure and avoid UI
timeouts when many test files run together.

## VS Code

Material Icon Theme is selected automatically. Prettier is the default formatter;
ESLint formats no files and only supplies fixes. The existing Prettier ESLint
extension is not needed for this workspace; use **Disable (Workspace)** for that
extension if a user-level configuration still invokes it.

If icons or diagnostics do not update after opening the folder, run
**Developer: Reload Window**. These settings apply to this repository, not to other
projects or user-level preferences.

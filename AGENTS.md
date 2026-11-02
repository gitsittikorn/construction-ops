# Project workflow

- Respond in Thai. Use English for code, identifiers and filenames.
- Preserve React, TypeScript, Vite, Firebase, Google Drive and IndexedDB architecture.
- Every new feature needs meaningful automated tests for successful operation and errors. Run `npm run check` before reporting completion; report what has not been tested on real services or devices.
- Use `npm.cmd` on Windows if PowerShell blocks npm.ps1.
- Keep UI, domain calculations and persistence separate. Never mark pending local data as verified cloud data.
- No frontend service-account keys, OAuth client secrets, or committed credentials.
- After verification run `npm run clean` for temporary generated artifacts. Do not delete user data, unknown files, credentials, source, lockfiles or IndexedDB to clean up.
- User has authorized project creation, dependency changes and fixes. Do not request conversational approval for routine implementation. Native sandbox permissions still apply.

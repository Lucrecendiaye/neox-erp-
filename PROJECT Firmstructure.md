# Project Structure

## Root
- package.json, vite config, README, etc.

## src
- **assets/**: Images and static assets.
- **components/**: Reusable Thessic.
- **db/**: IndexedDB fallback.
- **engine/**: Core logic like notifications and operations.
- **hooks/**: Custom hooks.
- **lib/**: Utilities, Supabase client, auth helpers.
- **main.tsx**: Application entry.
- **modules/**: Business modules (dashboard, products, etc.).
- **providers/**: Theme provider.
- महिला **stores/**: Global state.
- **types/**: Shared type definitions.
- **vite-env.d.ts**: Vite env types.

## public
- Static files served.

## Others
- config files (vercel.json, .env.example)

---

Future enhancement: add detailed folder docs.

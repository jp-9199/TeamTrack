# TeamTrack

TeamTrack is a cross-platform real-time collaboration platform designed for modern distributed teams.

## Monorepo Structure

```text
TeamTrack/
├── apps/
│   ├── web/               # Next.js App Router + TypeScript
│   ├── desktop/           # Electron + TypeScript
│   └── mobile/            # React Native + TypeScript
├── services/
│   └── backend/           # Node.js + Express + TypeScript
├── packages/
│   ├── shared-types/      # Foundational shared TypeScript contracts
│   ├── api-client/        # Foundational API client interfaces
│   ├── validation/        # Foundational validation types
│   ├── shared-utils/      # Cross-platform utility helpers
│   └── config/            # Shared configuration keys & default constants
├── database/
│   ├── migrations/        # Database migrations (future phase)
│   └── seeds/             # Database seed scripts (future phase)
├── infrastructure/        # Infrastructure configuration (future phase)
├── docs/                  # Architecture and technical documentation
├── .env.example           # Environment variable template
└── README.md              # Project documentation
```

## Technology Stack

- **Runtime**: Node.js (v20+)
- **Language**: TypeScript
- **Monorepo**: npm workspaces
- **Web**: Next.js (App Router), React
- **Desktop**: Electron, TypeScript
- **Mobile**: React Native, TypeScript
- **Backend**: Express, Node.js, TypeScript

## Development Commands

All commands are run from the repository root:

```bash
# Install dependencies across all workspaces
npm install

# Build shared packages
npm run build:packages

# Run full project build
npm run build

# Run TypeScript typechecks across all workspaces
npm run typecheck

# Start backend in development mode
npm run dev:backend

# Start web application in development mode
npm run dev:web

# Start desktop application in development mode
npm run dev:desktop
```

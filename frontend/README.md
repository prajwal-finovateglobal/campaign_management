# Frontend - Campaign Management Dashboard

Next.js 14 frontend application for managing campaigns, data, and disposition trees.

## Tech Stack

- **Framework:** Next.js 14.2.18
- **Language:** TypeScript
- **UI:** React 18, Tailwind CSS
- **Icons:** Lucide React
- **Charts:** ReactFlow (for disposition tree visualization)

## Quick Start

### Prerequisites

- Node.js 18 or higher
- npm

### Installation

```bash
# Install dependencies
npm install
```

### Configuration

Create `.env.local` file in the frontend directory:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

For AWS deployment, change to your backend URL:
```env
NEXT_PUBLIC_API_URL=https://your-aws-backend-url.com
```

### Development

```bash
npm run dev
```

Frontend will be available at `http://localhost:3000`

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
frontend/
├── app/                    # Next.js app router pages
│   ├── login/             # Login page
│   ├── share/             # Shared canvas pages
│   └── page.tsx           # Main dashboard
├── components/            # React components
│   ├── CampaignManagement.tsx
│   ├── DispositionTree.tsx
│   ├── DataTable.tsx
│   └── ...
├── lib/                   # Utilities
│   ├── api.ts            # API client with auth
│   └── cookies.ts        # Cookie management
└── public/               # Static assets
```

## Key Features

- **Authentication:** Cookie-based session management
- **Campaign Management:** Create, start, stop campaigns
- **Data Management:** Filter, view, and export data
- **Disposition Tree:** Interactive visualization with save/load
- **Shared Canvas:** Public read-only sharing links

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:8000` |

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## Authentication

- Uses cookie-based authentication
- Tokens stored in cookies (7-day expiration)
- Automatic token refresh and logout on 401 errors

## Deployment

See `../AWS_DEPLOYMENT_GUIDE.md` for detailed AWS deployment instructions.

Quick deployment:
```bash
bash ../setup_frontend.sh
bash ../run_frontend.sh
```


# Campaign Management - Frontend

Frontend application for Campaign Management System built with Next.js, React, and TypeScript.

## Prerequisites

- Node.js 18.x or higher
- npm or yarn package manager
- Backend API running on `http://localhost:8000`

## Setup Guide

### 1. Clone the Repository

```bash
git clone <repository-url>
cd campaign_management/frontend
```

### 2. Install Dependencies

```bash
npm install
# or
yarn install
```

### 3. Environment Configuration

Create a `.env.local` file in the `frontend` directory (if needed):

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Note:** The frontend currently uses hardcoded API URL `http://localhost:8000`. Update the API URL in components if your backend runs on a different port.

### 4. Run Development Server

```bash
npm run dev
# or
yarn dev
```

The application will be available at `http://localhost:3000`

### 5. Build for Production

```bash
npm run build
npm start
# or
yarn build
yarn start
```

## Features

- **Campaign Management**
  - Create, view, and delete campaigns
  - Refresh campaign status from Millis.ai
  - Upload records to campaigns

- **Phone & Caller Management**
  - Select and set caller phones for campaigns
  - View phone-agent associations
  - Start/stop campaigns

- **Data Management**
  - Filter and search campaign data
  - Column selection and presets
  - Export data to CSV
  - View and manage CSV data (CCD)

- **Client & Phase Management**
  - Create and manage clients
  - Create phases for clients
  - Campaign organization by phases


## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **State Management:** React Hooks (useState, useEffect, useMemo)

## Key Components

### CampaignManagement
Main component for managing campaigns, clients, and phases. Includes:
- Client and phase selection
- Campaign creation and management
- Phone/caller assignment
- Campaign start/stop controls

### DataTable
Displays filtered campaign data with:
- Sortable columns
- Column visibility toggles
- Duration formatting (MM:SS)
- Date/time formatting
- Metadata expansion

### FilterSection
Provides filtering options:
- Date range
- Connection status
- Direction (inbound/outbound)
- Language
- Duration range (seconds/minutes)
- Campaign selection

## API Integration

The frontend communicates with the backend API at `http://localhost:8000`:

- `GET /campaign` - Fetch campaigns
- `POST /campaign/create` - Create campaign
- `POST /campaign/set_caller` - Set caller phone
- `POST /campaign/start` - Start campaign
- `POST /campaign/stop` - Stop campaign
- `GET /phones` - Get available phones
- `GET /agent/{agent_id}` - Get agent details
- `POST /show_data` - Filter and fetch data
- `GET /get_csv_data` - Get CSV data

## Development

### Running in Development Mode
```bash
npm run dev
```

### Building for Production
```bash
npm run build
npm start
```

### Linting
```bash
npm run lint
```

## Troubleshooting

### Backend Connection Issues
- Ensure backend is running on `http://localhost:8000`
- Check CORS settings in backend
- Verify API endpoints are accessible

### Build Errors
- Clear `.next` folder: `rm -rf .next`
- Reinstall dependencies: `rm -rf node_modules && npm install`
- Check Node.js version compatibility

### Styling Issues
- Verify Tailwind CSS is properly configured
- Check `tailwind.config.js` for correct content paths
- Ensure CSS variables are defined

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)


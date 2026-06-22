# Portfolio Optimization

A Markowitz portfolio optimization application with a FastAPI backend and Next.js frontend.

## Architecture

This is a Turborepo monorepo with three applications:

- **`apps/api`** - Hono REST API backend
- **`apps/web`** - Next.js React frontend
- **`apps/mobile`** - Expo (React Native) mobile app

## Features

- **Markowitz Optimization**: Calculate optimal portfolio weights using mean-variance optimization
- **Efficient Frontier**: Visualize the risk-return tradeoff
- **Fund Analysis**: View cumulative returns, drawdowns, and monthly performance
- **Micro Finance**: Analyze micro finance portfolios with quarterly data
- **Historical Analysis**: Explore historical risk/return across portfolio combinations
- **OAuth Authentication**: Sign in with Google, GitHub, or Microsoft
- **Real-time Updates**: Yahoo Finance data updates with WebSocket progress

## Prerequisites

- Node.js 18+
- Python 3.11+
- pnpm 9+

## Quick Start

### 1. Install dependencies

```bash
# Install Node.js dependencies
pnpm install

# Install Python dependencies
cd apps/api
pip install -e ".[dev]"
cd ../..
```

### 2. Migrate data

```bash
# Migrate existing data from parquet/CSV to SQLite
python scripts/migrate-data.py
```

### 3. Configure environment

```bash
# Copy and edit environment variables
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` with your OAuth credentials if you want authentication.

### 4. Start development servers

```bash
# Start both API and web servers
pnpm dev

# Or start individually:
pnpm dev:api     # API on http://localhost:8000
pnpm dev:web     # Next.js on http://localhost:3000
pnpm dev:mobile  # Expo dev server (see apps/mobile/README.md)
```

## Project Structure

```
portfolio-optimization/
├── apps/
│   ├── api/                    # FastAPI backend
│   │   ├── src/
│   │   │   ├── auth/          # OAuth/JWT authentication
│   │   │   ├── funds/         # Fund management endpoints
│   │   │   ├── optimization/  # Portfolio optimization
│   │   │   ├── historical/    # Historical analysis
│   │   │   ├── microfin/      # Micro finance
│   │   │   └── tasks/         # Background tasks
│   │   ├── tests/
│   │   └── pyproject.toml
│   │
│   ├── web/                    # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/           # Pages (App Router)
│   │   │   ├── components/    # React components
│   │   │   ├── hooks/         # Custom hooks
│   │   │   └── lib/           # Utilities
│   │   └── package.json
│   │
│   └── mobile/                 # Expo (React Native) app
│       ├── src/
│       │   ├── app/           # expo-router routes
│       │   ├── components/    # React Native components
│       │   ├── hooks/         # Custom hooks
│       │   ├── i18n/          # Localization (es/en)
│       │   └── lib/           # API client & utilities
│       └── package.json
│
├── data/                       # Original data files
├── scripts/                    # Migration scripts
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

## API Documentation

Once the API is running, view the interactive documentation at:

- Swagger UI: http://localhost:8000/api/docs
- ReDoc: http://localhost:8000/api/redoc

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/funds/` | GET | List all funds |
| `/api/funds/{id}/prices` | GET | Get price history |
| `/api/optimization/min-variance` | POST | Calculate optimal portfolio |
| `/api/optimization/efficient-frontier` | POST | Get efficient frontier points |
| `/api/historical/portfolio-metrics` | POST | Calculate historical metrics |
| `/api/tasks/yahoo-update` | POST | Start data update |

## Running Tests

```bash
# Run all tests
pnpm test

# Run API tests only
cd apps/api && pytest tests/ -v

# Run web tests only
cd apps/web && pnpm test
```

## Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up --build

# Run in background
docker-compose up -d
```

The API will be available at http://localhost:8000 and the web app at http://localhost:3000.

## Development

### Adding a new fund

1. Add the fund to `data/t_fund.csv`
2. Run the migration script: `python scripts/migrate-data.py`
3. Update prices: POST to `/api/tasks/yahoo-update`

### Modifying optimization parameters

The core optimization logic is in `apps/api/src/optimization/service.py`. The `find_min_var_portfolio` function implements the Markowitz mean-variance optimization.

## Original Streamlit App

The original Streamlit application is still available in the `scripts/` directory:
- `scripts/Markowitz.py` - Main optimization page
- `scripts/Micro_Finance_Analyzer.py` - Micro finance analysis
- `scripts/Historical_Risk_Return.py` - Historical analysis

To run the original Streamlit app:
```bash
pip install streamlit
streamlit run app.py
```

## License

MIT

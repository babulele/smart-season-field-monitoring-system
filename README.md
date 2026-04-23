# SmartSeason Field Monitoring System

A simple full-stack web app to track crop progress across fields during a season with two roles: `ADMIN` and `AGENT`.
live deployment link: https://smart-season-field-monitoring-system-cm5qptw42.vercel.app

## Stack

- Backend: Node.js + Express + MySQL
- Frontend: React + Vite
- Auth: JWT (email/password login)

## Features

- Role-based login and protected APIs.
- Admin can create and manage fields.
- Admin can assign fields to agents.
- Agents can submit stage updates and observations for assigned fields only.
- Role-aware dashboard with:
  - total fields
  - status breakdown (`Active`, `AtRisk`, `Completed`)
  - recent updates

## Project Structure

- `backend` - Express API and MySQL schema bootstrap
- `frontend` - React app for admin/agent workflows

## Setup

## 1) Prerequisites

- Node.js 18+
- MySQL running locally

## 2) Database

Create a database:

```sql
CREATE DATABASE smartseason;
```

## 3) Backend

```bash
cd backend
copy .env.example .env
npm install
npm run dev
```

Environment variables:

- `PORT` (default `4000`)
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`

On startup, the backend auto-creates tables and seeds demo users.

## 4) Frontend

```bash
cd frontend
copy .env.example .env
npm install
npm run dev
```

Frontend expects API at `http://localhost:4000` unless overridden by `VITE_API_URL`.
Login uses seeded credentials:
- `admin@smartseason.co` / `Admin1234`
- `agent@smartseason.co` / `demo1234`

## API Endpoints

- `POST /auth/login`
- `GET /me`
- `GET /fields`
- `POST /fields` (admin)
- `PATCH /fields/:id` (admin; agents can update stage only on assigned fields)
- `POST /fields/:id/assign` (admin)
- `POST /fields/:id/updates` (agent on assigned fields)
- `GET /fields/:id/updates` (admin or assigned agent)
- `GET /dashboard/summary`
- `GET /agents` (admin helper endpoint for assignment)

## Status Logic

Status is computed on the backend to keep API/UI behavior aligned:

- `Completed`: `current_stage = HARVESTED`
- `AtRisk`: not harvested and either:
  - no recent update in the past 7 days, or
  - latest note includes one of: `pest`, `disease`, `dry`, `flood`
- `Active`: all other non-harvested fields

## Design Decisions

### Architecture
- **Monorepo Structure**: Backend and frontend co-located for easy development and deployment
- **JWT Authentication**: Stateless auth for scalability; tokens stored in localStorage on client
- **Role-Based Access Control**: Two roles (ADMIN, AGENT) with middleware enforcement at API level
- **Backend-Driven Status**: Field status computed server-side to ensure consistency across all clients

### Database
- **MySQL with Connection Pooling**: Chosen for relational structure and simplicity; pool limits set to 10
- **Auto-Schema Bootstrap**: Tables created on app startup for frictionless onboarding
- **Soft Dependencies**: Foreign keys use ON DELETE CASCADE for clean cascade behavior

### API Design
- **RESTful Endpoints**: Standard HTTP methods (GET, POST, PATCH) for clarity
- **Validation with Zod**: Lightweight schema validation at API layer
- **Error Responses**: Consistent JSON error format with HTTP status codes

### Frontend
- **React + Vite**: Modern, fast development experience with HMR
- **React Router**: Client-side routing for single-page navigation
- **State Management**: useState for component-level state; no external state lib needed for scope
- **Role-Aware Views**: Conditional rendering based on user role; separate dashboards for ADMIN vs AGENT

### Status Computation
- **Keyword-Based Risk**: Simple pattern matching ("pest", "disease", "dry", "flood") for AtRisk detection
- **Staleness Checks**: 7-day threshold for "no recent update" indicates field needs attention
- **Backend Authority**: Status always computed server-side on `/dashboard/summary` and `/fields` endpoints

## Assumptions and Trade-offs

### Assumptions
- Users have reliable internet connection; no offline sync needed
- Field assignments are 1:many (one field can have multiple agents; one agent can have multiple fields)
- Observations are entered once per update; no edit history or audit trail needed
- Seasons run within a calendar year; no multi-year spanning

### Trade-offs
- **Simplicity over Feature Richness**: No advanced features (multi-season, bulk operations, analytics) to stay focused
- **Schema Bootstrap vs Migrations**: Auto-create tables on startup instead of using a migration tool for speed
- **Keyword Detection vs ML**: Simple keyword matching instead of ML models for risk detection (transparent, easy to explain)
- **Minimal UI Styling**: Functional UI with basic CSS; no component library to reduce dependencies
- **No Real-Time Updates**: Polling-based data refresh; WebSocket would add complexity without clear benefit for this scope
- **Single Admin User**: Only one seeded admin user (easily extensible); focus on agent workflows

## Demo Credentials

**Admin Account:**
- Email: `admin@smartseason.co`
- Password: `Admin1234`

**Agent Account:**
- Email: `agent@smartseason.co`
- Password: `demo1234`

## Testing

Run smoke tests to verify core functionality:

```bash
cd backend
npm run test
```

Tests cover:
- Authentication (admin & agent login)
- Field creation and assignment
- Permission enforcement (agents cannot update unassigned fields)
- Status logic (AtRisk and Completed detection)

## Deployment (Optional)

This project can be deployed to cloud platforms. Example setup:

- **Backend**: Node.js hosting (Heroku, Railway, Render, AWS EC2)
- **Database**: MySQL instance (AWS RDS, DigitalOcean, Linode)
- **Frontend**: Static hosting (Netlify, Vercel, GitHub Pages after build)

Environment variables must be set on the hosting platform for:
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET` (use a strong random value in production)
- `VITE_API_URL` (frontend) pointing to deployed backend

Currently no live deployment link is available.

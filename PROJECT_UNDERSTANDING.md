# Project Understanding: Transmaa AI Smart Logistics

## 1) What this project is
Transmaa is a full-stack logistics management platform with:
- A **FastAPI + SQLAlchemy** backend exposing role-based APIs for users, drivers, and admins.
- A **React + Vite + Tailwind** frontend for login, registration, and dashboards by role.

The current implementation focuses on:
- Authentication + JWT-based authorization
- Ride request and ride lifecycle management
- Driver registration and verification
- Admin stats/dashboard endpoints
- Finance/insurance applications
- Vehicle marketplace listing and moderation
- Trip and shipment workflows for shared-capacity logistics

## 2) Backend architecture
### App entrypoint
- `app/main.py` initializes FastAPI, enables CORS for `http://localhost:5173`, registers routers, and creates DB tables on startup.

### Data and persistence
- SQLAlchemy engine/session are configured in `app/database.py`.
- Environment settings are loaded in `app/config.py`.
- Domain models live in `app/models/`:
  - `User`, `Driver`, `Ride`, `Trip`, `Shipment`, `FinanceApplication`, `VehicleListing`.

### Security model
- Password hashing and JWT creation/validation are implemented in `app/core/security.py`.
- Access is role-based (`user`, `driver`, `admin`) using dependency checks (`get_current_user`, `require_admin`, `require_driver`).

### API modules
- `app/routes/auth.py`: register/login.
- `app/routes/rides.py`: request, accept, and progress rides through statuses.
- `app/routes/drivers.py`: driver onboarding and admin verification.
- `app/routes/admin.py`: users/drivers/rides listing + aggregate stats.
- `app/routes/finance.py`: finance/insurance application workflow.
- `app/routes/marketplace.py`: vehicle listing and admin review.
- `app/routes/shipments.py`: shipment creation and shipment views.
- `app/routes/trips.py`: trip creation/listing and shipment assignment with capacity checks.

## 3) Frontend architecture
- React entrypoint in `transmaa-frontend/src/main.jsx` and route definitions in `src/App.jsx`.
- UI pages in `src/pages/`:
  - `Login`, `Register`, `DriverRegister`
  - `Dashboard` (role redirect), `UserDashboard`, `DriverDashboard`, `AdminDashboard`
- Shared layout + auth guard in `src/components/Layout.jsx` and `src/components/PrivateRoute.jsx`.
- Axios API helper in `src/services/api.js`.

## 4) End-to-end user flows currently implemented
1. User registers and logs in, receives JWT.
2. Frontend decodes role from JWT and redirects to role dashboard.
3. User can request rides and create shipments.
4. Driver registers profile and (after admin approval) can accept rides.
5. Driver can create trips and attach unassigned shipments while capacity remains.
6. Admin can inspect users/drivers/rides and view dashboard stats.
7. Drivers can apply for finance/insurance and list vehicles in marketplace; admins approve/reject.

## 5) Current strengths
- Clean modular backend route split by business domain.
- Practical role-based authorization on most critical actions.
- Capacity validation in both ride acceptance and trip-shipment assignment.
- Admin analytics endpoint consumed by frontend charts.

## 6) Gaps / risks noticed during review
- `app/core/security.py` hardcodes JWT secret/config rather than reading from env config.
- There are overlapping auth utilities (`app/core/security.py`, `app/dependencies/auth.py`, `app/utils/token.py`) with different token assumptions.
- Table creation uses `Base.metadata.create_all`, but there is no migration workflow.
- No automated tests are present in the repository.
- A committed `venv/` directory and `__pycache__` files add repo noise.
- Frontend currently hardcodes API URL strings in many components instead of fully centralizing API calls.

## 7) Suggested next steps
- Consolidate auth/token logic into a single source of truth.
- Move secrets and token settings fully to environment config.
- Introduce Alembic migrations.
- Add backend API tests (pytest + FastAPI TestClient).
- Add frontend integration smoke tests.
- Remove committed virtual environment artifacts.
- Add frontend pages for shipment and trip management to use the new endpoints.

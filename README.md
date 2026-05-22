# Packaging Configurator

A self-hosted web application for determining the optimal shipping package for products, calculating dimensional (DIM) weights, and exporting bulk shipping data for e-commerce fulfillment operations.

---

## Features

- **Package Configurator** — Select a product and find all compatible packaging options ranked by fit quality, with per-carrier shipping weight calculations
- **Bulk Configurator** — Upload an Excel/CSV file with multiple order lines; each line is matched to the best packaging and results are exported
- **Products** — Manage your product catalog (dimensions, weight, foldable flag, ships-in-own-packaging flag) with Excel import/export
- **Packaging** — Manage packaging options (boxes, bubble mailers, poly mailers, padded mailers) including capacity, tare weight, and DIM divisor overrides
- **Shipping Methods** — Configure carriers (UPS, USPS, FedEx, etc.) with per-method DIM divisors, weight limits, and DIM thresholds
- **Settings** — Admin password protection, automated database backups with configurable frequency and retention
- **API** — JSON REST API for programmatic access (see `/api-docs`)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express, TypeScript |
| Database | SQLite (via `better-sqlite3`) |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Excel I/O | ExcelJS |
| Process Manager | systemd (recommended for production) |

---

## Project Structure

```
packagingconfigurator/
├── client/                  # React frontend (Vite)
│   ├── src/
│   │   ├── api.ts           # API client functions
│   │   ├── types.ts         # Shared TypeScript types
│   │   ├── contexts/        # Auth context
│   │   ├── components/      # Reusable UI components
│   │   └── pages/           # Route-level page components
│   └── dist/                # Built frontend (after npm run build)
├── server/
│   ├── src/
│   │   ├── index.ts         # Express entry point, scheduler
│   │   ├── db.ts            # SQLite connection and schema init
│   │   └── routes/          # API route handlers
│   │       ├── configurator.ts   # Core algorithm + /analyze, /bulk, /export
│   │       ├── products.ts
│   │       ├── packaging.ts
│   │       ├── shipping.ts
│   │       ├── settings.ts
│   │       └── backup.ts
│   └── dist/                # Compiled server (after npm run build)
├── data/
│   └── app.db               # SQLite database (auto-created)
├── backups/                 # Automated database backups
├── start.sh                 # Start script (production)
└── package.json             # Root scripts
```

---

## Installation

### Prerequisites

- Node.js 18 or later — verify with `node -v`
- npm 9 or later — verify with `npm -v`

If Node.js is not installed, the quickest way on Ubuntu/Debian:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Development

```bash
git clone https://github.com/jonbrulotte-arch/packagingconfigurator.git
cd packagingconfigurator

# Install all dependencies (root, server, client)
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

# Start both server (port 3000) and client dev server (port 5173)
npm run dev
```

The client dev server proxies `/api/*` requests to the Express server at `http://localhost:3000`.

### Production Build

```bash
# Build server TypeScript
cd server && npm run build && cd ..

# Build client (outputs to client/dist/)
cd client && npm run build && cd ..
```

The Express server serves the built React app from `client/dist/` in production.  
Run the server directly:

```bash
node server/dist/index.js
```

Or use the provided start script:

```bash
chmod +x start.sh
./start.sh
```

---

## Running at System Startup (systemd)

Create `/etc/systemd/system/packagingconfigurator.service`:

```ini
[Unit]
Description=Packaging Configurator
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/home/your-user/packagingconfigurator
ExecStart=/home/your-user/packagingconfigurator/start.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable packagingconfigurator
sudo systemctl start packagingconfigurator
sudo systemctl status packagingconfigurator
```

---

## Updating from Git

```bash
cd /home/your-user/packagingconfigurator
git pull origin main

# Rebuild server and client
cd server && npm install && npm run build && cd ..
cd client && npm install && npm run build && cd ..

# Restart the service
sudo systemctl restart packagingconfigurator
```

---

## Configuration

All runtime settings are stored in the database (`Settings` page in the UI).

| Setting | Description | Default |
|---------|-------------|---------|
| Admin Password | Protects the app behind a PIN/password; leave blank for open access | *(blank)* |
| Backup Frequency | How often automated backups run: `daily`, `weekly`, or `monthly` | `daily` |
| Backup Hour | Hour of day (0–23) to run the backup | `2` (2 AM) |
| Max Backups | Maximum number of backup files to retain (oldest are pruned) | `7` |

Backup files are stored in `backups/` as `backup-YYYY-MM-DDTHH-MM-SS.db`.  
Pre-restore safety copies (`pre-restore-*.db`) are never automatically pruned.

### First-run setup

The database starts empty. Before the Configurator will return any results, you need to configure three things through the UI:

1. **Products** — add your product catalog (or import via Excel)
2. **Packaging** — add every box, bubble mailer, and poly mailer you ship in
3. **Shipping Methods** — add each carrier service with its weight range and DIM rules

Until at least one product, one packaging option, and one shipping method exist, the Configurator and Bulk Configurator pages will return no results.

---

## How the Configurator Works

### Packaging Algorithm

1. **Filter compatible packaging** — For each packaging option, check:
   - All product dimensions fit within the package's inner dimensions (with foldable products able to fold to their smallest dimension)
   - Total product volume does not exceed packaging capacity
   - Combined weight (products + tare) does not exceed the packaging's max weight limit
   - For mailers and flat-pack packaging with a `max_height`, product stacking thickness is calculated and checked against the capacity

2. **Rank by fit quality** — Packages are scored:
   - `perfect` — dimensions very close to product stack
   - `good` — reasonable fit
   - `loose` — significantly oversized
   - `large` — package is very large relative to product

3. **Calculate weights**:
   - **Actual Weight** = sum of product weights + packaging tare weight
   - **Product Thickness** (for mailers) = sum of each product's smallest dimension × quantity
   - **DIM Volume** = exterior length × exterior width × (product thickness + mailer material thickness)
   - **DIM Weight** = DIM Volume ÷ DIM divisor (per-carrier or global)
   - **Billed Weight** (per carrier) = `max(actual weight, DIM weight)` rounded up to nearest pound (or to 3 decimal places if under 1 lb)

4. **DIM weight flag** — A warning is shown when all available shipping methods bill by dimensional weight (i.e., no DIM-free carrier option exists for this package size).

### Foldable Products

Products marked **Foldable** can be folded flat. When placed in a mailer or flat-pack box, their smallest dimension (thickness) is used for stacking height calculations rather than their full height. This allows thin, flexible products (clothing, documents) to stack efficiently in padded or poly mailers.

### Ships In Own Packaging

Products marked **Ships In Own Packaging** are treated as standalone shipments. They do not need to be placed inside a shipping box — the product's own retail box is the shipping container. The configurator calculates DIM and actual weight directly from the product's dimensions and weight, applying the DIM divisor from each shipping method.

---

## Excel Import Formats

### Products Import

Columns (order matters, header names must match):

| Column | Description |
|--------|-------------|
| `Part Number` | Unique product ID |
| `Item Name` | Display name |
| `UPC Height (Inches)` | Height in inches |
| `UPC Width (Inches)` | Width in inches |
| `UPC Length (Inches)` | Length in inches |
| `UPC Weight (Pounds)` | Weight in pounds |
| `Foldable` | `1` = yes, `0` = no |
| `Ships In Own Packaging` | `1` = yes, `0` = no |

Existing products are **upserted** by Part Number (new rows inserted, existing rows updated).

Download the template from the Products page.

### Bulk Configurator Import

| Column | Description |
|--------|-------------|
| `Grouping ID` | Groups multiple line items into one shipment (optional) |
| `Product ID` | Must match a product in the database |
| `Quantity` | Integer quantity |

Multiple rows with the same Grouping ID are combined into a single shipment before packaging is evaluated. Rows without a Grouping ID are treated as individual shipments.

Download the template from the Bulk Configurator page.

---

## API Reference

All endpoints are prefixed with `/api/configurator` unless noted.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/analyze` | Find compatible packaging for a product/quantity combination |
| `POST` | `/bulk` | Process multiple shipment lines in one request |
| `POST` | `/bulk-export` | Same as `/bulk` but returns an Excel file |
| `GET` | `/bulk-template` | Download the bulk import Excel template |
| `GET` | `/export` | Export configurator result as Excel |
| `GET` | `/api/products` | List all products |
| `POST` | `/api/products` | Create a product |
| `PUT` | `/api/products/:id` | Update a product |
| `DELETE` | `/api/products/:id` | Delete a product |
| `POST` | `/api/products/import` | Bulk import products from Excel |
| `GET` | `/api/packaging` | List all packaging |
| `POST` | `/api/packaging` | Create packaging |
| `PUT` | `/api/packaging/:id` | Update packaging |
| `DELETE` | `/api/packaging/:id` | Delete packaging |
| `GET` | `/api/shipping` | List all shipping methods |
| `POST` | `/api/shipping` | Create a shipping method |
| `PUT` | `/api/shipping/:id` | Update a shipping method |
| `DELETE` | `/api/shipping/:id` | Delete a shipping method |
| `GET` | `/api/settings` | Get current settings |
| `PUT` | `/api/settings` | Update settings |
| `GET` | `/api/backups` | List available backups |
| `POST` | `/api/backups` | Create a manual backup |
| `POST` | `/api/backups/restore/:filename` | Restore from a backup |
| `GET` | `/api/backups/download/:filename` | Download a backup file |

Full request/response schemas are available in the app at `/api-docs`.

---

## Admin Password / Recovery

If you set an admin password and lose it:

1. Open the SQLite database with any SQLite client:
   ```bash
   sqlite3 data/app.db
   ```
2. Clear the password:
   ```sql
   UPDATE settings SET value = '' WHERE key = 'admin_password';
   ```
3. Restart the server.

---

## Database Schema

Key tables:

| Table | Description |
|-------|-------------|
| `products` | Product catalog (dimensions, weight, flags) |
| `packaging` | Packaging options (type, inner dims, exterior dims, tare weight, capacity) |
| `shipping_methods` | Carrier methods (DIM divisor, weight limit, DIM threshold) |
| `settings` | Key-value store for all app settings |

The database is auto-created at `data/app.db` on first run. Schema migrations are applied automatically.

---

## License

MIT

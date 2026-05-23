import { useState } from 'react';
import TocLayout from '../components/TocLayout';

const BASE = window.location.origin;

const TOC_ITEMS = [
  { id: 'auth', label: 'Auth' },
  { id: 'configurator', label: 'Configurator' },
  { id: 'products', label: 'Products' },
  { id: 'packaging', label: 'Packaging' },
  { id: 'shipping-methods', label: 'Shipping Methods' },
  { id: 'backups', label: 'Backups' },
  { id: 'fit-quality-reference', label: 'Fit Quality' },
  { id: 'error-responses', label: 'Error Responses' },
];

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-4 scroll-mt-6">
      <h2 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">{title}</h2>
      {children}
    </section>
  );
}

function Endpoint({
  method, path, description, request, response, note,
}: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  request?: { headers?: string; body?: string };
  response: string;
  note?: string;
}) {
  const [tab, setTab] = useState<'curl' | 'response'>('curl');

  const METHOD_COLORS: Record<string, string> = {
    GET: 'bg-green-100 text-green-800',
    POST: 'bg-blue-100 text-blue-800',
    PUT: 'bg-amber-100 text-amber-800',
    DELETE: 'bg-red-100 text-red-800',
  };

  const curlLines: string[] = [`curl -X ${method} "${BASE}/api${path}"`];
  if (request?.headers) curlLines.push(`  -H "${request.headers}"`);
  if (request?.body) curlLines.push(`  -d '${request.body}'`);
  const curl = curlLines.join(' \\\n');

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 flex items-start gap-3">
        <span className={`mt-0.5 flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded ${METHOD_COLORS[method]}`}>
          {method}
        </span>
        <div className="flex-1 min-w-0">
          <code className="text-sm font-mono text-gray-800">/api{path}</code>
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
          {note && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">{note}</p>}
        </div>
      </div>
      <div className="border-t border-gray-100">
        <div className="flex border-b border-gray-100">
          {(['curl', 'response'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs font-medium ${tab === t ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t === 'curl' ? 'Example Request' : 'Example Response'}
            </button>
          ))}
        </div>
        <pre className="bg-gray-900 text-green-300 text-xs px-5 py-4 overflow-x-auto whitespace-pre-wrap leading-relaxed">
          {tab === 'curl' ? curl : response}
        </pre>
      </div>
    </div>
  );
}

export default function ApiDocs() {
  return (
    <TocLayout items={TOC_ITEMS}>
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">API Reference</h1>
        <p className="text-sm text-gray-500 mt-2">
          All features of this tool are available as a JSON REST API. Any external system — warehouse
          software, ERP, scripts, or automation — can query or drive the configurator directly without
          using the UI.
        </p>
      </div>

      {/* Base URL */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-4 space-y-2">
        <p className="text-sm font-semibold text-blue-900">Base URL</p>
        <code className="block text-sm font-mono text-blue-800">{BASE}/api</code>
        <p className="text-xs text-blue-700">
          All endpoints are relative to this base. Requests with a body must include{' '}
          <code>Content-Type: application/json</code>. File upload endpoints use{' '}
          <code>multipart/form-data</code>. Protected admin endpoints require an{' '}
          <code>X-Session-Token</code> header (see Auth section).
        </p>
      </div>

      {/* ── AUTH ── */}
      <Section id="auth" title="Auth">
        <p className="text-sm text-gray-600">
          When an admin password is configured, the Products, Packaging, Shipping, and Settings
          endpoints are protected. Obtain a session token via <code>POST /auth/login</code> and
          pass it as <code>X-Session-Token: &lt;token&gt;</code> on subsequent requests.
          Tokens expire after 24 hours.
        </p>

        <Endpoint
          method="GET"
          path="/auth/status"
          description="Check whether an admin password is configured."
          response={JSON.stringify({ protected: true }, null, 2)}
        />

        <Endpoint
          method="POST"
          path="/auth/login"
          description="Log in with the admin password. Returns a session token on success."
          request={{
            headers: 'Content-Type: application/json',
            body: JSON.stringify({ password: 'yourpassword' }),
          }}
          response={JSON.stringify({ token: 'abc123...', success: true }, null, 2)}
        />

        <Endpoint
          method="POST"
          path="/auth/logout"
          description="Invalidate the current session token."
          request={{ headers: 'X-Session-Token: abc123...' }}
          response={JSON.stringify({ success: true }, null, 2)}
        />

        <Endpoint
          method="POST"
          path="/auth/set-password"
          description="Set or change the admin password. If a password is already set, currentPassword is required. Minimum 4 characters. All active sessions are invalidated."
          request={{
            headers: 'Content-Type: application/json',
            body: JSON.stringify({ newPassword: 'newpass', currentPassword: 'oldpass' }),
          }}
          response={JSON.stringify({ success: true }, null, 2)}
        />

        <Endpoint
          method="POST"
          path="/auth/remove-password"
          description="Remove the admin password entirely. Requires the current password. All sessions are invalidated."
          request={{
            headers: 'Content-Type: application/json',
            body: JSON.stringify({ currentPassword: 'currentpass' }),
          }}
          response={JSON.stringify({ success: true }, null, 2)}
        />

        <Endpoint
          method="POST"
          path="/auth/emergency-reset?token=<token>"
          description="Clear the admin password using the one-time recovery token printed to the server console at startup. Token changes every restart."
          response={JSON.stringify({ success: true, message: 'Admin password cleared. Access admin pages without a password.' }, null, 2)}
          note="The recovery token is printed to stdout each time the server starts. It cannot be recovered from the API — check the server logs."
        />
      </Section>

      {/* ── CONFIGURATOR ── */}
      <Section id="configurator" title="Configurator">
        <Endpoint
          method="POST"
          path="/configurator/analyze"
          description="Analyze one or more products and return ranked packaging recommendations. Products with ships_in_own_packaging=1 appear in standalone_items rather than packaging results. If total weight ≥ LTL threshold, ltl_required is true and ltl_shipping contains matching freight methods."
          request={{
            headers: 'Content-Type: application/json',
            body: JSON.stringify({ items: [{ product_id: 'SKU-001', quantity: 2 }, { product_id: 'SKU-002', quantity: 1 }] }),
          }}
          response={JSON.stringify({
            items: [
              { product: { id: 'SKU-001', name: 'Widget A', height: 3, width: 4, length: 5, weight: 1.2, foldable: 0, ships_in_own_packaging: 0 }, quantity: 2 },
            ],
            total_actual_weight: 2.4,
            total_item_count: 2,
            settings: { dim_divisor: 139, pack_efficiency: 0.7, ltl_threshold: 150 },
            results: [
              {
                packaging: { id: 1, name: 'Medium Box 10x8x6', type: 'box', height: 6, width: 8, length: 10, max_weight: 20, packaging_weight: 0.5 },
                products_weight: 2.4,
                packaging_weight: 0.5,
                total_weight: 3,
                dim_weight: 3,
                weight_flag: true,
                max_weight_flag: false,
                volume_utilization: 45.0,
                fit_quality: 'loose',
                has_folded_items: false,
                shipping: [{ method_id: 1, method_name: 'UPS Ground', billed_weight: 3, dim_applied: true }],
              },
            ],
            standalone_items: [],
            ltl_required: false,
            ltl_shipping: [],
          }, null, 2)}
        />

        <Endpoint
          method="POST"
          path="/configurator/bulk"
          description="Upload an Excel/CSV file with multiple shipments grouped by Order ID. Returns packaging recommendations for all shipments. Each shipment includes standalone_items for ships-in-own-packaging products and ltl_required for LTL detection."
          request={{ headers: 'Content-Type: multipart/form-data' }}
          response={JSON.stringify({
            shipments: [
              {
                id: 'ORD-001',
                items: [{ product: { id: 'SKU-001', name: 'Widget A', ships_in_own_packaging: 0 }, quantity: 2 }],
                total_item_count: 2,
                total_actual_weight: 2.4,
                best: { packaging: { name: 'Medium Box 10x8x6' }, fit_quality: 'good', total_weight: 3, dim_weight: 3, weight_flag: true, max_weight_flag: false },
                results: ['... full ranked list ...'],
                standalone_items: [],
                ltl_required: false,
                ltl_shipping: [],
                error: null,
              },
            ],
            parse_errors: [],
            summary: { total: 1, matched: 1, flagged: 1, ltl: 0, errors: 0 },
            settings: { dim_divisor: 139, pack_efficiency: 0.7, ltl_threshold: 150 },
          }, null, 2)}
          note='File field name must be "file". Columns required: Order ID, Part Number, Quantity.'
        />

        <Endpoint
          method="GET"
          path="/configurator/settings"
          description="Retrieve current configurator settings."
          response={JSON.stringify({ dim_divisor: '139', pack_efficiency: '0.70', weight_unit: 'lbs', dim_unit: 'in', ltl_threshold: '150' }, null, 2)}
        />

        <Endpoint
          method="PUT"
          path="/configurator/settings"
          description="Update configurator settings. All fields optional — only supplied fields are changed."
          request={{
            headers: 'Content-Type: application/json',
            body: JSON.stringify({ dim_divisor: 166, pack_efficiency: 0.65, ltl_threshold: 150 }),
          }}
          response={JSON.stringify({ dim_divisor: '166', pack_efficiency: '0.65', weight_unit: 'lbs', dim_unit: 'in', ltl_threshold: '150' }, null, 2)}
        />

        <Endpoint
          method="GET"
          path="/configurator/template"
          description="Download the single-shipment Excel template (Product ID + Quantity columns)."
          response="→ Binary .xlsx file download (configurator-template.xlsx)"
        />

        <Endpoint
          method="GET"
          path="/configurator/bulk-template"
          description="Download the bulk shipment Excel template (Order ID + Part Number + Quantity columns)."
          response="→ Binary .xlsx file download (bulk-configurator-template.xlsx)"
        />
      </Section>

      {/* ── PRODUCTS ── */}
      <Section id="products" title="Products">
        <Endpoint
          method="GET"
          path="/products"
          description="Return all products ordered by ID."
          response={JSON.stringify([
            { id: 'SKU-001', name: 'Widget A', height: 3, width: 4, length: 5, weight: 1.2, foldable: 0, ships_in_own_packaging: 0, upc: '012345678901' },
            { id: 'SKU-002', name: 'Appliance XL', height: 18, width: 14, length: 24, weight: 45.0, foldable: 0, ships_in_own_packaging: 1, upc: null },
          ], null, 2)}
        />

        <Endpoint
          method="GET"
          path="/products/:id"
          description="Return a single product by ID or UPC. Both the Part Number and the UPC barcode resolve to the same product record."
          response={JSON.stringify({ id: 'SKU-001', name: 'Widget A', height: 3, width: 4, length: 5, weight: 1.2, foldable: 0, ships_in_own_packaging: 0, upc: '012345678901' }, null, 2)}
        />

        <Endpoint
          method="POST"
          path="/products"
          description="Create a new product. foldable: 1 = always ship folded (longest dim halved, thickness doubled). ships_in_own_packaging: 1 = bypass box search, use product dims for DIM weight. upc is optional — used for barcode scanner lookup."
          request={{
            headers: 'Content-Type: application/json',
            body: JSON.stringify({ id: 'SKU-003', name: 'Widget C', height: 2, width: 3, length: 4, weight: 0.8, foldable: 0, ships_in_own_packaging: 0, upc: '012345678903' }),
          }}
          response={JSON.stringify({ id: 'SKU-003', name: 'Widget C', height: 2, width: 3, length: 4, weight: 0.8, foldable: 0, ships_in_own_packaging: 0, upc: '012345678903' }, null, 2)}
        />

        <Endpoint
          method="PUT"
          path="/products/:id"
          description="Update an existing product. ID cannot be changed. Pass upc: null to clear the barcode."
          request={{
            headers: 'Content-Type: application/json',
            body: JSON.stringify({ name: 'Widget C v2', height: 2.5, width: 3, length: 4, weight: 0.9, foldable: 1, ships_in_own_packaging: 0, upc: '012345678903' }),
          }}
          response={JSON.stringify({ id: 'SKU-003', name: 'Widget C v2', height: 2.5, width: 3, length: 4, weight: 0.9, foldable: 1, ships_in_own_packaging: 0, upc: '012345678903' }, null, 2)}
        />

        <Endpoint
          method="DELETE"
          path="/products/:id"
          description="Delete a product by ID."
          response={JSON.stringify({ success: true }, null, 2)}
        />

        <Endpoint
          method="GET"
          path="/products/export"
          description="Download all products as an Excel file in the same column format as the import template, ready for bulk editing and re-import."
          response="→ Binary .xlsx file download (products-export.xlsx)"
        />

        <Endpoint
          method="POST"
          path="/products/import"
          description="Upload an Excel/CSV file to bulk upsert products. Existing products are updated by Part Number; new ones are created. Optional columns: Foldable, Ships In Own Packaging (1/true/yes to enable), UPC (barcode for scanner lookup)."
          request={{ headers: 'Content-Type: multipart/form-data' }}
          response={JSON.stringify({ imported: 42, errors: ['Row 7: missing Part Number — skipped'] }, null, 2)}
          note='File field name must be "file". Required columns: Part Number, Item Name, UPC Height (Inches), UPC Width (Inches), UPC Length (Inches), UPC Weight (Pounds). Optional: Foldable, Ships In Own Packaging, UPC.'
        />

        <Endpoint
          method="POST"
          path="/products/delete-all"
          description="Permanently delete every product in the catalog. Requires the admin password in the request body. If no admin password is set, any value (including empty string) is accepted."
          request={{ body: JSON.stringify({ password: 'your-admin-password' }, null, 2) }}
          response={JSON.stringify({ success: true, deleted: 8142 }, null, 2)}
          note="This action is irreversible. Create a database backup before calling this endpoint."
        />
      </Section>

      {/* ── PACKAGING ── */}
      <Section id="packaging" title="Packaging">
        <Endpoint
          method="GET"
          path="/packaging"
          description="Return all packaging options ordered by type then name."
          response={JSON.stringify([
            { id: 1, name: 'Small Box 6x4x3', type: 'box', height: 3, width: 4, length: 6, max_weight: 10, max_height: null, packaging_weight: 0.3, notes: null, active: 1 },
            { id: 2, name: 'Bubble Mailer 9x12', type: 'bubble_mailer', height: 1, width: 9, length: 12, max_weight: 2, max_height: 1.5, packaging_weight: 0.1, notes: null, active: 1 },
          ], null, 2)}
        />

        <Endpoint
          method="POST"
          path="/packaging"
          description="Create a new packaging option. type must be: box, bubble_mailer, poly_mailer, or other. max_height (mailers only) sets max stuffed thickness used for fit checks, volume, and DIM instead of H."
          request={{
            headers: 'Content-Type: application/json',
            body: JSON.stringify({ name: 'Bubble Mailer 9x12', type: 'bubble_mailer', height: 1, width: 9, length: 12, max_weight: 2, max_height: 1.5, packaging_weight: 0.1, notes: null, active: 1 }),
          }}
          response={JSON.stringify({ id: 3, name: 'Bubble Mailer 9x12', type: 'bubble_mailer', height: 1, width: 9, length: 12, max_weight: 2, max_height: 1.5, packaging_weight: 0.1, notes: null, active: 1 }, null, 2)}
        />

        <Endpoint
          method="PUT"
          path="/packaging/:id"
          description="Update an existing packaging option. All fields can be changed."
          request={{
            headers: 'Content-Type: application/json',
            body: JSON.stringify({ name: 'Bubble Mailer 9x12', type: 'bubble_mailer', height: 1, width: 9, length: 12, max_weight: 2, max_height: 2.0, packaging_weight: 0.1, notes: null, active: 1 }),
          }}
          response={JSON.stringify({ id: 3, name: 'Bubble Mailer 9x12', type: 'bubble_mailer', height: 1, width: 9, length: 12, max_weight: 2, max_height: 2.0, packaging_weight: 0.1, notes: null, active: 1 }, null, 2)}
        />

        <Endpoint
          method="DELETE"
          path="/packaging/:id"
          description="Delete a packaging option by ID."
          response={JSON.stringify({ success: true }, null, 2)}
        />

        <Endpoint
          method="POST"
          path="/packaging/delete-all"
          description="Permanently delete every packaging option. Requires the admin password in the request body. If no admin password is set, any value (including empty string) is accepted."
          request={{ body: JSON.stringify({ password: 'your-admin-password' }, null, 2) }}
          response={JSON.stringify({ success: true, deleted: 24 }, null, 2)}
          note="This action is irreversible. Create a database backup before calling this endpoint."
        />
      </Section>

      {/* ── SHIPPING METHODS ── */}
      <Section id="shipping-methods" title="Shipping Methods">
        <p className="text-sm text-gray-600">
          Shipping methods are discrete carrier services with a weight range. Every active method
          is evaluated per-result to find matches based on the carrier-specific billed weight.
          Per-carrier DIM divisors and volume thresholds (e.g. USPS 1 728 in³ rule) are
          configured here.
        </p>

        <Endpoint
          method="GET"
          path="/shipping"
          description="Return all shipping methods ordered by sort_order, then min_weight. is_ltl: 1 marks LTL freight methods that are never billed by DIM."
          response={JSON.stringify([
            { id: 1, name: 'UPS Ground', min_weight: 0, max_weight: 150, dim_divisor: 139, dim_threshold: null, is_ltl: 0, active: 1, notes: null, sort_order: 0 },
            { id: 2, name: 'USPS Priority Mail', min_weight: 0, max_weight: 70, dim_divisor: 166, dim_threshold: 1728, is_ltl: 0, active: 1, notes: 'DIM only above 1728 in³', sort_order: 1 },
            { id: 3, name: 'LTL Freight', min_weight: 150, max_weight: null, dim_divisor: null, dim_threshold: null, is_ltl: 1, active: 1, notes: null, sort_order: 10 },
          ], null, 2)}
        />

        <Endpoint
          method="POST"
          path="/shipping"
          description="Create a new shipping method. dim_divisor overrides the global setting; leave null to use global. dim_threshold: DIM billing only applies when box volume exceeds this value (in³). is_ltl: 1 marks this as an LTL freight method — DIM divisor and threshold are ignored; the method is billed at actual weight only and only appears when the shipment weight meets the LTL threshold."
          request={{
            headers: 'Content-Type: application/json',
            body: JSON.stringify({ name: 'FedEx Ground', min_weight: 0, max_weight: 150, dim_divisor: 139, dim_threshold: null, is_ltl: 0, active: 1, notes: null, sort_order: 0 }),
          }}
          response={JSON.stringify({ id: 4, name: 'FedEx Ground', min_weight: 0, max_weight: 150, dim_divisor: 139, dim_threshold: null, is_ltl: 0, active: 1, notes: null, sort_order: 0 }, null, 2)}
        />

        <Endpoint
          method="PUT"
          path="/shipping/:id"
          description="Update an existing shipping method. All fields can be changed including is_ltl."
          request={{
            headers: 'Content-Type: application/json',
            body: JSON.stringify({ name: 'FedEx Ground', min_weight: 0, max_weight: 150, dim_divisor: 139, dim_threshold: null, is_ltl: 0, active: 0, notes: 'Temporarily disabled', sort_order: 0 }),
          }}
          response={JSON.stringify({ id: 4, name: 'FedEx Ground', min_weight: 0, max_weight: 150, dim_divisor: 139, dim_threshold: null, is_ltl: 0, active: 0, notes: 'Temporarily disabled', sort_order: 0 }, null, 2)}
        />

        <Endpoint
          method="DELETE"
          path="/shipping/:id"
          description="Delete a shipping method by ID."
          response={JSON.stringify({ success: true }, null, 2)}
        />
      </Section>

      {/* ── BACKUP ── */}
      <Section id="backups" title="Backups">
        <p className="text-sm text-gray-600">
          The SQLite database is backed up automatically every 6 hours. Backups are stored on the
          server and can be listed, downloaded, restored, or deleted via these endpoints. Restoring
          saves a pre-restore safety copy, replaces the live database, and restarts the server process.
        </p>

        <Endpoint
          method="GET"
          path="/backup"
          description="List all available backups, newest first."
          response={JSON.stringify([
            { filename: 'backup-2026-05-21T06-00-00-000Z.db', size: 204800, created_at: '2026-05-21T06:00:01.000Z' },
            { filename: 'backup-2026-05-21T00-00-00-000Z.db', size: 200704, created_at: '2026-05-21T00:00:01.000Z' },
          ], null, 2)}
        />

        <Endpoint
          method="POST"
          path="/backup"
          description="Create a manual backup immediately. Returns the new backup entry."
          response={JSON.stringify({ filename: 'backup-2026-05-21T12-34-56-789Z.db', size: 204800, created_at: '2026-05-21T12:34:57.000Z' }, null, 2)}
        />

        <Endpoint
          method="GET"
          path="/backup/download/:filename"
          description="Download a backup file as a binary .db attachment."
          response="→ Binary SQLite .db file download"
        />

        <Endpoint
          method="POST"
          path="/backup/restore/:filename"
          description="Restore the database from a backup. A pre-restore safety copy is saved first, then the server restarts automatically."
          response={JSON.stringify({ success: true, message: 'Database restored. Server is restarting.' }, null, 2)}
          note="This operation replaces all current data. The server will restart after a successful restore — allow a few seconds before making further requests."
        />

        <Endpoint
          method="DELETE"
          path="/backup/:filename"
          description="Delete a backup file from the server."
          response={JSON.stringify({ success: true }, null, 2)}
        />
      </Section>

      {/* ── FIT QUALITY ── */}
      <Section id="fit-quality-reference" title="Fit Quality Reference">
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Volume Utilization</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Meaning</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Flag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                ['exact', '≥ 90%', 'Products fill nearly all available space', 'No'],
                ['good', '60 – 89%', 'Efficient use with room for padding', 'No'],
                ['loose', '35 – 59%', 'Packaging significantly larger than needed', '⚠ Yes'],
                ['large', '< 35%', 'Box much larger than products', '⚠ Yes'],
              ].map(([val, range, meaning, flag]) => (
                <tr key={val} className="even:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-brand-700 font-semibold">{val}</td>
                  <td className="px-4 py-3 font-mono text-xs">{range}</td>
                  <td className="px-4 py-3 text-gray-600">{meaning}</td>
                  <td className="px-4 py-3 text-xs font-medium">{flag === 'No' ? <span className="text-gray-400">No</span> : <span className="text-amber-600">{flag}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── ERROR FORMAT ── */}
      <Section id="error-responses" title="Error Responses">
        <p className="text-sm text-gray-600">
          All errors return a non-2xx HTTP status code and a JSON body with an <code>error</code> field.
        </p>
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <pre className="bg-gray-900 text-green-300 text-xs px-5 py-4 overflow-x-auto whitespace-pre-wrap">
            {`HTTP 404
${JSON.stringify({ error: 'Products not found: SKU-999' }, null, 2)}

HTTP 400
${JSON.stringify({ error: 'items must be a non-empty array' }, null, 2)}

HTTP 401
${JSON.stringify({ error: 'Invalid or missing recovery token' }, null, 2)}

HTTP 409
${JSON.stringify({ error: 'Product ID already exists' }, null, 2)}`}
          </pre>
        </div>
      </Section>
    </div>
    </TocLayout>
  );
}

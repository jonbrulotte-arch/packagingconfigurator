export default function Instructions() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Instructions &amp; How It Works</h1>
        <p className="mt-2 text-sm text-gray-500">
          A guide to setting up and using the Packaging Configurator, plus a full breakdown of how
          recommendations and flags are calculated.
        </p>
      </div>

      {/* ── SETUP ── */}
      <Section title="Getting Started">
        <p>There are three things to configure before using the Configurator:</p>
        <ol className="mt-3 space-y-2 list-decimal list-inside text-sm text-gray-700">
          <li>
            <strong>Add your products</strong> — go to the <NavRef to="Products" /> tab. Enter each
            product's ID, name, and dimensions (height, width, length in inches; weight in lbs).
            You can also bulk-import from an Excel spreadsheet.
          </li>
          <li>
            <strong>Add your packaging options</strong> — go to the <NavRef to="Packaging" /> tab
            and enter every box, bubble mailer, or other container you have on hand.
          </li>
          <li>
            <strong>Review settings</strong> — go to <NavRef to="Settings" /> and confirm the DIM
            divisor and packing efficiency match your carrier and workflow.
          </li>
        </ol>
        <p className="mt-3 text-sm text-gray-700">
          Once those are in place, open the <NavRef to="Configurator" /> tab, enter one or more
          product IDs, and click <strong>Find Best Packaging</strong>.
        </p>
      </Section>

      {/* ── PRODUCTS ── */}
      <Section title="Products Tab">
        <SubSection title="Manual entry">
          <p>
            Click <strong>+ Add Product</strong> and fill in all six fields. The Product ID is your
            SKU or internal code — it must be unique and is used when querying the Configurator.
          </p>
        </SubSection>
        <SubSection title="Excel / spreadsheet import">
          <p>
            Click <strong>Import Excel</strong> and upload an <code>.xlsx</code>, <code>.xls</code>,
            or <code>.csv</code> file. The first row must be column headers. Accepted column names
            (case-insensitive, spaces and special characters ignored):
          </p>
          <table className="mt-3 w-full text-sm border border-gray-200 rounded overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Field</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Required column header</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Also accepted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                ['Product ID', 'Part Number', 'Product ID, ID'],
                ['Product Name', 'Item Name', 'Product Name, Name'],
                ['Height', 'UPC Height (Inches)', 'Height (in), Height'],
                ['Width', 'UPC Width (Inches)', 'Width (in), Width'],
                ['Length', 'UPC Length (Inches)', 'Length (in), Length'],
                ['Weight', 'UPC Weight (Pounds)', 'Weight (lbs), Weight'],
              ].map(([field, primary, fallback]) => (
                <tr key={field} className="even:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-800">{field}</td>
                  <td className="px-3 py-2 font-mono text-xs text-brand-700 font-semibold">{primary}</td>
                  <td className="px-3 py-2 text-gray-500 font-mono text-xs">{fallback}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-gray-700">
            Importing is an <strong>upsert</strong> — if a Part Number already exists it will be
            updated, otherwise a new record is created. Re-uploading a revised spreadsheet is safe.
          </p>
        </SubSection>
      </Section>

      {/* ── PACKAGING ── */}
      <Section title="Packaging Tab">
        <p className="text-sm text-gray-700">
          Add every container you ship in. Key fields:
        </p>
        <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc list-inside">
          <li>
            <strong>Dimensions (H × W × L)</strong> — interior usable dimensions in inches.
          </li>
          <li>
            <strong>Max Weight</strong> — optional. If set, the Configurator will raise an
            overweight flag when combined product weight exceeds this value.
          </li>
          <li>
            <strong>Active toggle</strong> — inactive packaging is excluded from all recommendations.
            Use this to temporarily remove options without deleting them.
          </li>
        </ul>
      </Section>

      {/* ── CONFIGURATOR ── */}
      <Section title="Configurator Tab">
        <p className="text-sm text-gray-700">
          Enter one or more product IDs (one per line or comma-separated) and click{' '}
          <strong>Find Best Packaging</strong>. The tool returns every active packaging option that
          can physically hold all the products, ranked from <em>best fit</em> (tightest) to{' '}
          <em>loosest</em>.
        </p>
      </Section>

      {/* ── ALGORITHM ── */}
      <Section title="How Results Are Calculated">

        <SubSection title="Step 1 — Can the products fit?">
          <p>For each active packaging option the tool checks whether all selected products can physically fit inside.</p>
          <Callout color="blue" label="Single product">
            Both the product and the box have their three dimensions sorted largest → smallest.
            The product fits if every sorted box dimension is ≥ the corresponding sorted product
            dimension.
            <Code>
              {`box  sorted: [12, 10, 8]   (L ≥ W ≥ H)
product sorted: [9,  6, 4]
✓ 12≥9, 10≥6, 8≥4 → fits`}
            </Code>
          </Callout>
          <Callout color="blue" label="Multiple products">
            Two conditions must both pass:
            <ol className="mt-2 space-y-1 list-decimal list-inside">
              <li>Every individual product must pass the single-product check above.</li>
              <li>
                The combined volume of all products must fit within the box's usable volume,
                accounting for packing efficiency (see Settings):
                <Code>{`combined product volume ≤ box volume × packing efficiency`}</Code>
              </li>
            </ol>
            <p className="mt-2 text-xs text-gray-600">
              The default packing efficiency of 70 % reflects the reality that irregularly shaped
              items cannot fill a box perfectly. Lower it for very irregular products; raise it for
              uniform flat items.
            </p>
          </Callout>
          <p className="mt-3 text-sm text-gray-700">
            Packaging that fails either check does not appear in the results at all.
          </p>
        </SubSection>

        <SubSection title="Step 2 — Volume utilization">
          <p>For every option that passed Step 1:</p>
          <Code>{`Volume Utilization (%) = (sum of all product volumes ÷ box volume) × 100`}</Code>
          <p className="mt-2 text-sm text-gray-700">
            Results are ranked by this number, highest first. A higher percentage means less wasted
            space — the "Best Fit" badge goes to the top result.
          </p>
          <table className="mt-3 w-full text-sm border border-gray-200 rounded overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Label</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Utilization range</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Meaning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {[
                ['Exact Fit', '≥ 90 %', 'Products fill nearly all available space'],
                ['Good Fit', '60 – 89 %', 'Efficient use with room for padding'],
                ['Loose Fit ⚠', '35 – 59 %', 'Packaging significantly larger than needed — flagged for review'],
                ['Oversized', '< 35 %', 'Box is much larger than the products'],
              ].map(([label, range, meaning]) => (
                <tr key={label} className="even:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{label}</td>
                  <td className="px-3 py-2 font-mono text-xs">{range}</td>
                  <td className="px-3 py-2 text-gray-600">{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SubSection>

        <SubSection title="Step 3 — Dimensional weight">
          <p>Carriers calculate a <em>dimensional weight</em> for every shipment and charge whichever is higher — actual weight or dimensional weight. The formula:</p>
          <Code>{`Dimensional Weight (lbs) = (Box L × Box W × Box H) ÷ DIM Divisor`}</Code>
          <p className="mt-2 text-sm text-gray-700">
            Common divisor values (all using inches):
          </p>
          <table className="mt-2 w-full text-sm border border-gray-200 rounded overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Divisor</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Used by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {[
                ['139', 'UPS / FedEx domestic'],
                ['166', 'USPS Priority Mail'],
                ['5000', 'International shipments (cm-based)'],
              ].map(([d, carrier]) => (
                <tr key={d} className="even:bg-gray-50">
                  <td className="px-3 py-2 font-mono">{d}</td>
                  <td className="px-3 py-2">{carrier}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-gray-700">
            Change the divisor on the <NavRef to="Settings" /> page to match your carrier.
          </p>
        </SubSection>

        <SubSection title="Step 4 — Warning flags">
          <Callout color="amber" label="⚠ Dimensional weight flag">
            Appears when <strong>dimensional weight &gt; actual weight</strong>. The carrier will
            ignore the scale and bill by the box's dimensional weight instead. Consider a smaller
            box to reduce the dimensional weight charge.
          </Callout>
          <Callout color="red" label="✕ Overweight flag">
            Appears when the <strong>combined product weight exceeds the packaging's configured max
            weight</strong>. The box may not be structurally rated for this load, or the carrier
            may reject the shipment. Switch to a heavier-duty option.
          </Callout>
        </SubSection>
      </Section>

      {/* ── SETTINGS ── */}
      <Section title="Settings Reference">
        <table className="w-full text-sm border border-gray-200 rounded overflow-hidden">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Setting</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Default</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-700">
            {[
              ['DIM Divisor', '139', 'Divisor used in the dimensional weight formula. Match to your carrier.'],
              ['Packing Efficiency', '0.70 (70 %)', 'Fraction of box volume available for multi-product shipments. Lower for bulky/irregular items.'],
              ['Weight Unit', 'lbs', 'Display label only — does not convert values.'],
              ['Dimension Unit', 'in', 'Display label only — does not convert values.'],
            ].map(([s, d, desc]) => (
              <tr key={s} className="even:bg-gray-50">
                <td className="px-3 py-2 font-medium">{s}</td>
                <td className="px-3 py-2 font-mono text-xs">{d}</td>
                <td className="px-3 py-2 text-gray-600">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2 mb-4">{title}</h2>
      <div className="space-y-4 text-sm text-gray-700">{children}</div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-gray-800">{title}</h3>
      <div className="space-y-2 text-sm text-gray-700">{children}</div>
    </div>
  );
}

function Callout({ color, label, children }: { color: 'blue' | 'amber' | 'red'; children: React.ReactNode; label: string }) {
  const styles = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    red: 'bg-red-50 border-red-200 text-red-900',
  };
  return (
    <div className={`border rounded p-3 mt-2 ${styles[color]}`}>
      <p className="font-semibold text-sm mb-1">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-2 bg-gray-900 text-green-300 text-xs rounded px-4 py-3 overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  );
}

function NavRef({ to }: { to: string }) {
  return <strong className="text-brand-700">{to}</strong>;
}

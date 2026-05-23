import TocLayout from '../components/TocLayout';

const TOC_ITEMS = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'products-tab', label: 'Products Tab' },
  { id: 'packaging-tab', label: 'Packaging Tab' },
  { id: 'shipping-methods-tab', label: 'Shipping Methods' },
  { id: 'configurator-tab', label: 'Configurator' },
  { id: 'bulk-configurator-tab', label: 'Bulk Configurator' },
  { id: 'how-results-are-calculated', label: 'How Results Work' },
  { id: 'settings-reference', label: 'Settings' },
  { id: 'admin-security', label: 'Admin & Security' },
];

export default function Instructions() {
  return (
    <TocLayout items={TOC_ITEMS}>
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Instructions &amp; How It Works</h1>
        <p className="mt-2 text-sm text-gray-500">
          A guide to setting up and using the Packaging Configurator, plus a full breakdown of how
          recommendations and flags are calculated.
        </p>
      </div>

      {/* ── SETUP ── */}
      <Section id="getting-started" title="Getting Started">
        <p>There are four things to configure before using the Configurator:</p>
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
            <strong>Add your shipping methods</strong> — go to the <NavRef to="Shipping" /> tab
            and configure each carrier service with its weight range, DIM divisor, and any volume
            threshold rules (e.g. USPS DIM only applies above 1 728 in³).
          </li>
          <li>
            <strong>Review settings</strong> — go to <NavRef to="Settings" /> and confirm the DIM
            divisor, packing efficiency, and LTL threshold match your carrier and workflow.
          </li>
        </ol>
        <p className="mt-3 text-sm text-gray-700">
          Once those are in place, open the <NavRef to="Configurator" /> tab, enter one or more
          product IDs, and click <strong>Find Best Packaging</strong>.
        </p>
      </Section>

      {/* ── PRODUCTS ── */}
      <Section id="products-tab" title="Products Tab">
        <SubSection title="Manual entry">
          <p>
            Click <strong>+ Add Product</strong> and fill in all fields. The Product ID is your
            SKU or internal code — it must be unique and is used when querying the Configurator.
          </p>
        </SubSection>

        <SubSection title="Foldable products">
          <p>
            Some items — garments, poly mailers, flexible pouches, flat soft goods — can be folded
            in half before packing. Checking <strong>Foldable</strong> on a product tells the
            Configurator to always use the folded dimensions when evaluating packaging, which
            unlocks smaller options that would otherwise be rejected.
          </p>
          <Callout color="blue" label="How the fold is modelled">
            Folding in half along the longest dimension produces two stacked layers:
            <Code>
              {`Original:  H × W × L  (e.g. 1" × 12" × 18")
Folded:   2H × W × (L÷2)  →  2" × 12" × 9"

Longest dimension halved  →  fits in a shorter/smaller box
Thickness (shortest dim) doubled  →  two layers now stacked
Volume unchanged  →  2 × 1 × 12 × 9 = 1 × 12 × 18 = 216 in³`}
            </Code>
            The fit check and volume utilization both use the folded dimensions. Weight is
            unaffected — folding does not change how much the item weighs.
          </Callout>
          <p className="mt-2">
            Results that include foldable products show an indigo <strong>↕ items folded</strong> badge
            so it is always clear when smaller packaging was made possible by folding.
          </p>
        </SubSection>

        <SubSection title="Ships in Own Packaging">
          <p>
            Some products ship directly in their own manufacturer or retail packaging — appliances,
            large equipment, items pre-boxed by the vendor — with no outer shipping box.
            Check <strong>Ships in Own Packaging</strong> on any product to reflect this.
          </p>
          <Callout color="blue" label="How ships-in-own-packaging works">
            <ul className="mt-1 space-y-1 list-disc list-inside text-sm">
              <li>The product is removed from the packaging search entirely — no outer box is assigned.</li>
              <li>DIM weight is calculated using the product's own H × W × L dimensions, because those <em>are</em> the shipping dimensions.</li>
              <li>A teal <strong>✦ Ships Own Pkg</strong> card appears in the Configurator results, showing the per-unit DIM weight, billed weight, and matching shipping methods.</li>
              <li>The product's weight is still included in the shipment's total weight for LTL detection purposes.</li>
            </ul>
          </Callout>
          <p className="mt-2">
            A shipment can mix regular products (which get a box assigned) and ships-in-own-packaging
            products (which get their own card). Both are shown in the same result view.
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
                ['Foldable', 'Foldable', '(optional) 1, true, yes, or y to enable'],
                ['Ships In Own Packaging', 'Ships In Own Packaging', '(optional) 1, true, yes, or y to enable'],
                ['UPC', 'UPC', '(optional) UPC Code, Barcode — GS1 barcode for scanner lookup'],
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
          <p className="mt-2 text-sm text-gray-700">
            Use <strong>Export</strong> to download your full product catalog as an Excel file in the
            same format — useful for bulk editing (adding UPCs, updating dimensions) before re-importing.
          </p>
        </SubSection>

        <SubSection title="UPC barcode scanner support">
          <p>
            Each product has an optional <strong>UPC</strong> field for its GS1 barcode. When set,
            you can use a USB or Bluetooth barcode scanner on the Configurator page — the scanner
            types the UPC into the Product ID field and the server resolves it to the correct product
            automatically. No configuration needed; external scanners emulate keyboard input.
          </p>
          <Callout color="blue" label="How UPC lookup works">
            When you submit a product lookup, the server checks{' '}
            <code>WHERE id = ? OR upc = ?</code> — so both your internal Part Number and the
            product's GS1 barcode resolve to the same record. You can mix Part Numbers and scanned
            UPCs in the same Configurator session.
          </Callout>
          <p className="mt-2">
            UPCs can be added individually via the Add/Edit form, or bulk-loaded via the Excel
            import by including a <code>UPC</code> column.
          </p>
        </SubSection>
      </Section>

      {/* ── PACKAGING ── */}
      <Section id="packaging-tab" title="Packaging Tab">
        <p className="text-sm text-gray-700">
          Add every container you ship in. Key fields:
        </p>
        <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc list-inside">
          <li>
            <strong>Dimensions (H × W × L)</strong> — interior usable dimensions in inches.
          </li>
          <li>
            <strong>Max Height / Thickness (in)</strong> — mailers only. Because a mailer's actual
            size when filled is determined by how thick the contents are, this field sets the
            maximum stuffed thickness the mailer can accommodate. When set, this value replaces the
            H dimension in all fit checks, volume utilization, and DIM weight calculations — giving
            you accurate results that reflect the mailer's real constraints rather than a nominal
            height. See below for details.
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

        <SubSection title="Mailer thickness vs. box height">
          <p>
            Boxes have fixed rigid walls — their H × W × L dimensions are the usable interior.
            Mailers (bubble mailers, poly mailers) are flexible: the opening is defined by W × L,
            but the height/thickness of the filled mailer depends entirely on what goes inside.
          </p>
          <Callout color="blue" label="How Max Height is used for mailers">
            <ul className="mt-1 space-y-1 list-disc list-inside text-sm">
              <li><strong>Fit check (single item):</strong> product thickness must be ≤ Max Height, and the flat dimensions are reduced by the product thickness before checking the product's other two dimensions — see Envelope Physics below.</li>
              <li><strong>Fit check (multiple items):</strong> total stacked thickness (sum of each item's thinnest dimension × quantity) must be ≤ Max Height, and flat dimensions are reduced by the total stacked thickness.</li>
              <li><strong>Volume utilization:</strong> calculated using Max Height × W × L as the effective interior volume.</li>
              <li><strong>DIM weight:</strong> calculated using the actual packed exterior dimensions — flat dims reduced by product thickness, height equal to product thickness + mailer material.</li>
            </ul>
          </Callout>
          <p className="mt-2">
            Leaving Max Height blank for a mailer falls back to using the H dimension — useful
            if you prefer to treat the mailer like a rigid container.
          </p>
        </SubSection>

        <SubSection title="Envelope physics — why flat dimensions shrink">
          <p>
            A bubble or poly mailer's listed dimensions (e.g. <strong>13.75" × 9.5"</strong>) are
            measured flat and empty. When a product of thickness <strong>T</strong> is inserted, the
            flexible material must wrap around all four edges of the item. This consumes{' '}
            <strong>T/2 of the flat dimension on each face</strong>, reducing both the usable width
            and usable length by <strong>T</strong> total:
          </p>
          <Code>
            {`Available width  = Mailer W − Product Thickness (T)
Available length = Mailer L − Product Thickness (T)

Example — Bubble Mailer 13.75" × 9.5", product 11.6" × 9.1" × 2.3":
  Available width  = 13.75 − 2.3 = 11.45"   product needs 11.6"  → does NOT fit
  Available length =  9.5  − 2.3 =  7.2"   product needs  9.1"  → does NOT fit

Without this correction the flat check alone (11.6 ≤ 13.75, 9.1 ≤ 9.5) would
incorrectly pass — the mailer physically cannot close around this product.`}
          </Code>
          <p className="mt-2">
            For <strong>multi-item shipments</strong> the correction uses the{' '}
            <em>total stacked thickness</em> of all items rather than a single item's thickness —
            because the envelope must wrap around the entire stack:
          </p>
          <Code>
            {`Total Thickness = sum of (each item's thinnest dimension × quantity)
Available width  = Mailer W − Total Thickness
Available length = Mailer L − Total Thickness

Every item in the shipment must fit within those reduced dimensions.`}
          </Code>
          <Callout color="amber" label="Applies to bubble mailers and poly mailers only">
            This correction is applied exclusively to <strong>Bubble Mailer</strong> and{' '}
            <strong>Poly Mailer</strong> packaging types — rigid boxes and other packaging types
            are not affected. Other packaging types that use Max Height (flat-pack boxes,
            etc.) do not experience the same physical dimension reduction.
          </Callout>
          <p className="mt-2">
            The same thickness-based flat reduction also applies to the{' '}
            <strong>DIM volume calculation</strong> for these mailer types, since the carrier
            measures the actual exterior of the packed mailer — not the empty flat dimensions.
            A product that is thick relative to the mailer's opening will result in a noticeably
            smaller DIM volume than the nominal mailer size would suggest.
          </p>
        </SubSection>
      </Section>

      {/* ── SHIPPING METHODS ── */}
      <Section id="shipping-methods-tab" title="Shipping Methods Tab">
        <p className="text-sm text-gray-700">
          Configure each carrier service you use. A shipping method is a specific service
          (e.g. "UPS Ground", "USPS Priority Mail", "FedEx 2Day") with its own weight range
          and billing rules. Every active method is evaluated against each packaging result —
          methods whose range covers the shipment's billed weight appear as chips on the result card.
        </p>
        <SubSection title="Weight range (Min / Max Weight)">
          <p>
            Each method has a <strong>Min Weight</strong> and optional <strong>Max Weight</strong>
            (in lbs). A method only appears on a result if the shipment's carrier-specific billed
            weight falls within that range. Leave Max Weight blank for unlimited.
          </p>
          <Callout color="blue" label="Example — UPS Ground 0–150 lbs, FedEx Ground 0–150 lbs">
            If the billed weight is 12 lbs, both UPS Ground and FedEx Ground appear.
            If it is 183 lbs (LTL), neither appears — but an LTL freight method configured
            for 150+ lbs would.
          </Callout>
        </SubSection>
        <SubSection title="Per-carrier DIM divisor">
          <p>
            Each method can have its own <strong>DIM Divisor</strong>. When set, it overrides
            the global divisor from Settings for that method's billed-weight calculation.
            Leave blank to use the global setting.
          </p>
          <p className="mt-2 text-sm text-gray-700">
            This lets you model different billing correctly in the same analysis — for example
            UPS Ground uses 139 while USPS Priority Mail uses 166.
          </p>
        </SubSection>
        <SubSection title="DIM Volume Threshold">
          <p>
            Some carriers only apply dimensional weight billing if the package volume exceeds
            a threshold. Set <strong>DIM Threshold (in³)</strong> to enable this rule for a method.
          </p>
          <Callout color="blue" label="USPS example — DIM only above 1 728 in³">
            USPS Priority Mail does not apply DIM billing unless the package volume exceeds
            1 728 in³ (a 12" cube). Set DIM Threshold to 1728 on the USPS method to model this
            correctly — packages at or below that volume are billed at actual weight only.
          </Callout>
          <p className="mt-2">
            Leave blank if the carrier always applies DIM billing regardless of package size.
          </p>
        </SubSection>
        <SubSection title="Sort order">
          <p>
            The <strong>Sort Order</strong> field controls the display order of methods on result
            cards. Lower numbers appear first. Methods with the same sort order are sorted by
            min weight.
          </p>
        </SubSection>
      </Section>

      {/* ── CONFIGURATOR ── */}
      <Section id="configurator-tab" title="Configurator Tab">
        <p className="text-sm text-gray-700">
          Enter one or more product IDs (one per row) and quantities, then click{' '}
          <strong>Find Best Packaging</strong>. The tool returns every active packaging option that
          can physically hold all the products, ranked from <em>best fit</em> (tightest) to{' '}
          <em>loosest</em>.
        </p>
        <p className="mt-2 text-sm text-gray-700">
          Products flagged <strong>Ships in Own Packaging</strong> appear in a separate teal section
          above the packaging results — they bypass the box search and show per-unit DIM weight and
          matching shipping methods directly.
        </p>
        <p className="mt-2 text-sm text-gray-700">
          If the shipment's combined weight meets or exceeds the LTL threshold (default 150 lbs),
          a red <strong>LTL Freight Required</strong> banner appears at the top of the results.
          Packaging options are still shown when available (a heavy item may fit a box and ship LTL
          on a pallet), but you are warned that standard parcel carriers do not apply.
        </p>
      </Section>

      {/* ── BULK CONFIGURATOR ── */}
      <Section id="bulk-configurator-tab" title="Bulk Configurator Tab">
        <p className="text-sm text-gray-700">
          Upload an Excel spreadsheet with multiple shipments — one product row per line, grouped
          by Order ID. Required columns: <code>Order ID</code>, <code>Part Number</code>,{' '}
          <code>Quantity</code>. Multiple rows with the same Order ID are treated as a single
          shipment.
        </p>
        <SubSection title="Results summary bar">
          <table className="mt-2 w-full text-sm border border-gray-200 rounded overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Counter</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Meaning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {[
                ['Total Shipments', 'Number of unique Order IDs processed'],
                ['Matched', 'Shipments with at least one valid packaging option (or all items ship in own packaging)'],
                ['Flagged', 'Matched shipments where the best option has a DIM weight flag or is overweight'],
                ['LTL Freight', 'Shipments whose total weight meets or exceeds the LTL threshold'],
                ['No Match / Error', 'Shipments with no compatible packaging found, or a missing product ID'],
              ].map(([counter, meaning]) => (
                <tr key={counter} className="even:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{counter}</td>
                  <td className="px-3 py-2 text-gray-600">{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SubSection>
        <SubSection title="Row status indicators">
          <p>Each shipment row is color-coded:</p>
          <ul className="mt-2 space-y-1 text-sm text-gray-700 list-disc list-inside">
            <li><strong className="text-green-700">✓ Green</strong> — matched, no flags</li>
            <li><strong className="text-amber-600">⚠ Amber</strong> — matched but flagged (DIM, overweight, or loose fit)</li>
            <li><strong className="text-red-600">LTL Red</strong> — shipment weight exceeds LTL threshold</li>
            <li><strong className="text-gray-500">— Gray</strong> — no packaging option found for packaged items</li>
            <li><strong className="text-red-500">✕ Error</strong> — one or more product IDs not found in the catalog</li>
          </ul>
        </SubSection>
      </Section>

      {/* ── ALGORITHM ── */}
      <Section id="how-results-are-calculated" title="How Results Are Calculated">

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
          <p className="mt-2 text-sm text-gray-700">
            <strong>Foldable products</strong> use their folded dimensions for both checks above —
            the longest dimension is halved and the thickness (shortest dimension) is doubled before
            any comparison is made. See the Products Tab section for details.
          </p>
          <p className="mt-2 text-sm text-gray-700">
            <strong>Bubble and poly mailers</strong> apply an additional envelope physics correction
            during the fit check — see <em>Envelope physics</em> in the Packaging Tab section above
            for the full explanation.
          </p>
          <p className="mt-2 text-sm text-gray-700">
            <strong>Ships-in-own-packaging products</strong> are excluded from this step entirely —
            no box is assigned to them. See their own section above.
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
          <p>Carriers calculate a <em>dimensional weight</em> for every shipment and charge whichever is higher — actual weight or dimensional weight.</p>
          <Code>{`Dimensional Weight (lbs) = CEIL( Box L × Box W × Box H ÷ DIM Divisor )`}</Code>
          <Code>{`Billed Weight (lbs)      = MAX( CEIL(Actual Weight), DIM Weight )`}</Code>
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
            The global DIM divisor is set on the <NavRef to="Settings" /> page. Each{' '}
            <NavRef to="Shipping" /> method can override this with its own per-carrier divisor.
            When a method has a <strong>DIM Volume Threshold</strong> set, DIM billing only applies
            if the box volume exceeds that threshold — otherwise actual weight is used for that method.
          </p>
        </SubSection>

        <SubSection title="Step 4 — Shipping method matching">
          <p>
            For each packaging result, every active shipping method is evaluated independently
            using that method's own DIM divisor and threshold rules to compute the carrier-specific
            billed weight. Methods are shown on the result card when the billed weight falls within
            the method's configured min–max weight range.
          </p>
          <Callout color="blue" label="Amber DIM badge on shipping chip">
            When a shipping chip shows an amber <strong>DIM</strong> badge, it means DIM weight
            is higher than actual weight for that specific carrier — the carrier will bill by
            dimensional weight, not the scale weight.
          </Callout>
        </SubSection>

        <SubSection title="Step 5 — LTL Freight detection">
          <p>
            Before packaging is evaluated, the shipment's total actual weight (all products,
            including ships-in-own-packaging items) is compared against the{' '}
            <strong>LTL Threshold</strong> (default 150 lbs). If the threshold is met or exceeded:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-gray-700 list-disc list-inside">
            <li>A red <strong>LTL Freight Required</strong> banner is shown.</li>
            <li>LTL-range shipping methods (e.g. those with min_weight ≥ 150) are matched by actual weight only — no DIM billing applies to LTL freight.</li>
            <li>Standard packaging options are still evaluated and shown if any fit, since the item may still ship in a box on a pallet.</li>
          </ul>
        </SubSection>

        <SubSection title="Step 6 — Warning flags">
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
          <Callout color="amber" label="⚠ Loose Fit flag">
            Appears when volume utilization is below 60 %. The box is significantly larger than
            the contents, which inflates dimensional weight charges and leaves product poorly
            supported. Consider a smaller option.
          </Callout>
        </SubSection>
      </Section>

      {/* ── SETTINGS ── */}
      <Section id="settings-reference" title="Settings Reference">
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
              ['DIM Divisor', '139', 'Global divisor used in the dimensional weight formula. Individual shipping methods can override this.'],
              ['Packing Efficiency', '0.70 (70 %)', 'Fraction of box volume available for multi-product shipments. Lower for bulky/irregular items.'],
              ['LTL Threshold', '150 lbs', 'Shipments at or above this total weight are flagged as LTL Freight. Standard industry cutoff is 150 lbs.'],
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

      {/* ── ADMIN & SECURITY ── */}
      <Section id="admin-security" title="Admin &amp; Security">
        <SubSection title="Admin password">
          <p>
            The Products, Packaging, Shipping, and Settings pages can be protected with a password.
            Set one from the <NavRef to="Settings" /> page under <strong>Admin Password</strong>.
            Once set, a <strong>Lock</strong> button appears in the navigation — click it to lock
            the session. The Configurator, Bulk Configurator, and Instructions pages are always
            accessible without a password.
          </p>
        </SubSection>
        <SubSection title="Password recovery">
          <p>
            If you forget the admin password, a one-time recovery token is printed to the server
            console every time the server starts:
          </p>
          <Code>
            {`[Auth] Emergency recovery token: a3f9...
       POST /api/auth/emergency-reset?token=a3f9... to clear the admin password.`}
          </Code>
          <p className="mt-2 text-sm text-gray-700">
            Send a POST request to that URL and the password hash is deleted — no password
            will be required to access admin pages until you set a new one.
            The token changes every time the server restarts, so it cannot be reused after a reboot.
          </p>
        </SubSection>
        <SubSection title="Database backups">
          <p>
            The SQLite database is backed up automatically on a configurable schedule (daily,
            weekly, or monthly, at a configured hour). You can also create a manual backup at
            any time from the <NavRef to="Settings" /> page under <strong>Database Backups</strong>.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-gray-700 list-disc list-inside">
            <li><strong>Download</strong> — save a backup file locally for off-server storage.</li>
            <li>
              <strong>Restore</strong> — replaces the live database with the selected backup.
              A safety copy of the current database is saved automatically before any restore.
              The server restarts after a restore to pick up the new database file.
            </li>
            <li><strong>Delete</strong> — permanently removes a backup file from the server.</li>
          </ul>
          <Callout color="amber" label="Restore is destructive">
            Restoring overwrites ALL current data — products, packaging, shipping methods, and
            settings. The automatic pre-restore safety copy gives you one level of undo, but
            proceed carefully.
          </Callout>
        </SubSection>
      </Section>
    </div>
    </TocLayout>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
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

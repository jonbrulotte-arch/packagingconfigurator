import { Router, Request, Response } from 'express';
import db from '../db';
import { requireAdmin, resolveAuth } from './auth';

const router = Router();

// ── Settings ──────────────────────────────────────────────────────────────────

// Maps our product/pricing fields to the attribute names used in the Salsify channel JSON.
export interface SalsifyFieldMapping {
  id: string;
  name: string;
  height: string;
  width: string;
  length: string;
  weight: string;
  upc: string;
  foldable: string;
  ships_in_own_packaging: string;
  product_cost: string;
  retail_price: string;
}

const DEFAULT_MAPPING: SalsifyFieldMapping = {
  id: 'Product ID',
  name: 'Product Name',
  height: 'Height (In)',
  width: 'Width (In)',
  length: 'Length (In)',
  weight: 'Weight (lbs)',
  upc: 'UPC',
  foldable: 'Foldable',
  ships_in_own_packaging: 'Ships in Own Packaging',
  product_cost: 'Product Cost',
  retail_price: 'Retail Price',
};

const ATTR_DEFAULTS = {
  salsify_attr_length: 'Calculated Shipping Length (Inches)',
  salsify_attr_width: 'Calculated Shipping Width (Inches)',
  salsify_attr_height: 'Calculated Shipping Height (Inches)',
  salsify_attr_weight: 'Calculated Shipping Weight (Pounds)',
} as const;

function getSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function getMapping(): SalsifyFieldMapping {
  const s = getSettings();
  try {
    const parsed = s.salsify_field_mapping ? JSON.parse(s.salsify_field_mapping) : {};
    return { ...DEFAULT_MAPPING, ...parsed };
  } catch {
    return { ...DEFAULT_MAPPING };
  }
}

router.get('/settings', requireAdmin, (_req: Request, res: Response) => {
  const s = getSettings();
  res.json({
    salsify_enabled: s.salsify_enabled === '1',
    salsify_org_id: s.salsify_org_id ?? '',
    salsify_channel_url: s.salsify_channel_url ?? '',
    salsify_attr_length: s.salsify_attr_length ?? ATTR_DEFAULTS.salsify_attr_length,
    salsify_attr_width: s.salsify_attr_width ?? ATTR_DEFAULTS.salsify_attr_width,
    salsify_attr_height: s.salsify_attr_height ?? ATTR_DEFAULTS.salsify_attr_height,
    salsify_attr_weight: s.salsify_attr_weight ?? ATTR_DEFAULTS.salsify_attr_weight,
    field_mapping: getMapping(),
  });
});

router.put('/settings', requireAdmin, (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  db.transaction(() => {
    if (body.salsify_enabled !== undefined) upsert.run('salsify_enabled', body.salsify_enabled ? '1' : '0');
    for (const key of ['salsify_org_id', 'salsify_channel_url', ...Object.keys(ATTR_DEFAULTS)]) {
      if (typeof body[key] === 'string') upsert.run(key, (body[key] as string).trim());
    }
    if (body.field_mapping != null && typeof body.field_mapping === 'object') {
      const cleaned: Record<string, string> = {};
      for (const field of Object.keys(DEFAULT_MAPPING) as (keyof SalsifyFieldMapping)[]) {
        const v = (body.field_mapping as Record<string, unknown>)[field];
        if (typeof v === 'string' && v.trim()) cleaned[field] = v.trim();
      }
      upsert.run('salsify_field_mapping', JSON.stringify(cleaned));
    }
  })();
  res.json({ success: true });
});

// ── Job plumbing (reuses the report_cache running/ready/error pattern) ────────

function setJob(type: string, status: 'running' | 'ready' | 'error', payload?: unknown, error?: string) {
  db.prepare(`
    INSERT OR REPLACE INTO report_cache (type, status, payload, error, computed_at, started_at)
    VALUES (?, ?, ?, ?, ?, COALESCE((SELECT started_at FROM report_cache WHERE type = ?), ?))
  `).run(
    type, status,
    payload != null ? JSON.stringify(payload) : null,
    error ?? null,
    status === 'running' ? null : new Date().toISOString(),
    type,
    new Date().toISOString(),
  );
}

function getJob(type: string) {
  const row = db.prepare('SELECT * FROM report_cache WHERE type = ?').get(type) as
    | { status: string; payload: string | null; error: string | null; computed_at: string | null; started_at: string | null }
    | undefined;
  if (!row) return { status: 'pending' };
  if (row.status === 'running') return { status: 'running', started_at: row.started_at };
  if (row.status === 'error') return { status: 'error', error: row.error };
  return { status: 'ready', computed_at: row.computed_at, data: row.payload ? JSON.parse(row.payload) : null };
}

let pullRunning = false;
let pushRunning = false;

// Resolve the acting user's Salsify API key, or an error message.
function actingUserKey(req: Request): { key: string } | { error: string; code: number } {
  const s = getSettings();
  if (s.salsify_enabled !== '1') return { error: 'Salsify sync is disabled — enable it in Settings', code: 400 };
  const auth = resolveAuth(req);
  if (auth.kind !== 'user') {
    return { error: 'Salsify operations require signing in with a user account that has a Salsify API key (My Profile)', code: 400 };
  }
  const row = db.prepare('SELECT salsify_api_key FROM users WHERE id = ?').get(auth.user.id) as { salsify_api_key: string | null } | undefined;
  if (!row?.salsify_api_key) {
    return { error: 'Your account has no Salsify API key — add one under Settings → My Profile', code: 400 };
  }
  return { key: row.salsify_api_key };
}

const asBool = (v: unknown): number => {
  const s = String(v ?? '').toLowerCase().trim();
  return ['1', 'true', 'yes', 'y'].includes(s) ? 1 : 0;
};

// ── Pull: channel JSON → products + pricing ───────────────────────────────────

const MAX_BODY_BYTES = 50 * 1024 * 1024;

async function runPull(key: string) {
  const s = getSettings();
  const mapping = getMapping();
  try {
    const response = await fetch(s.salsify_channel_url, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Channel endpoint returned HTTP ${response.status}`);
    }
    const text = await response.text();
    if (text.length > MAX_BODY_BYTES) throw new Error('Channel response exceeds the 50 MB limit');

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Channel endpoint did not return valid JSON');
    }
    const rows: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as Record<string, unknown>)?.data)
      ? ((parsed as Record<string, unknown>).data as unknown[])
      : Array.isArray((parsed as Record<string, unknown>)?.products)
      ? ((parsed as Record<string, unknown>).products as unknown[])
      : [];
    if (rows.length === 0) throw new Error('Channel JSON contained no product rows (expected an array, or {data:[...]}, or {products:[...]})');

    const upsertProduct = db.prepare(`
      INSERT INTO products (id, name, height, width, length, weight, foldable, ships_in_own_packaging, upc)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, height = excluded.height, width = excluded.width,
        length = excluded.length, weight = excluded.weight, foldable = excluded.foldable,
        ships_in_own_packaging = excluded.ships_in_own_packaging, upc = excluded.upc,
        updated_at = CURRENT_TIMESTAMP
    `);
    const upsertPricing = db.prepare(`
      INSERT INTO product_pricing (product_id, product_cost, retail_price)
      VALUES (?, ?, ?)
      ON CONFLICT(product_id) DO UPDATE SET
        product_cost = COALESCE(excluded.product_cost, product_cost),
        retail_price = COALESCE(excluded.retail_price, retail_price),
        updated_at = CURRENT_TIMESTAMP
    `);
    const exists = db.prepare('SELECT 1 FROM products WHERE id = ?');

    let created = 0, updated = 0, pricingUpdated = 0, skipped = 0;
    const errors: string[] = [];

    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      db.transaction(() => {
        for (let j = 0; j < chunk.length; j++) {
          const raw = chunk[j];
          const idx = i + j + 1;
          if (raw == null || typeof raw !== 'object') { skipped++; errors.push(`Row ${idx}: not an object — skipped`); continue; }
          const r = raw as Record<string, unknown>;

          const id = String(r[mapping.id] ?? '').trim();
          const name = String(r[mapping.name] ?? '').trim();
          const height = Number(r[mapping.height]);
          const width = Number(r[mapping.width]);
          const length = Number(r[mapping.length]);
          const weight = Number(r[mapping.weight]);

          if (!id || !name) { skipped++; errors.push(`Row ${idx}: missing "${mapping.id}" or "${mapping.name}" — skipped`); continue; }
          if ([height, width, length, weight].some(n => isNaN(n) || n <= 0)) {
            skipped++; errors.push(`Row ${idx} (${id}): invalid dimensions/weight — skipped`); continue;
          }

          const upc = String(r[mapping.upc] ?? '').trim() || null;
          const wasExisting = exists.get(id) != null;
          upsertProduct.run(id, name, height, width, length, weight, asBool(r[mapping.foldable]), asBool(r[mapping.ships_in_own_packaging]), upc);
          wasExisting ? updated++ : created++;

          // Pricing: only touch fields actually present in the row
          const costRaw = r[mapping.product_cost];
          const retailRaw = r[mapping.retail_price];
          const cost = costRaw != null && costRaw !== '' ? Number(costRaw) : null;
          const retail = retailRaw != null && retailRaw !== '' ? Number(retailRaw) : null;
          if ((cost != null && !isNaN(cost)) || (retail != null && !isNaN(retail))) {
            upsertPricing.run(id, cost != null && !isNaN(cost) ? cost : null, retail != null && !isNaN(retail) ? retail : null);
            pricingUpdated++;
          }
        }
      })();
      await new Promise<void>(resolve => setImmediate(resolve));
    }

    setJob('salsify_pull', 'ready', {
      total: rows.length, created, updated, pricing_updated: pricingUpdated, skipped,
      errors: errors.slice(0, 100),
    });
  } catch (err) {
    setJob('salsify_pull', 'error', undefined, err instanceof Error ? err.message : 'Pull failed');
  } finally {
    pullRunning = false;
  }
}

router.post('/pull', (req: Request, res: Response) => {
  const result = actingUserKey(req);
  if ('error' in result) return res.status(result.code).json({ error: result.error });
  const s = getSettings();
  if (!s.salsify_channel_url) return res.status(400).json({ error: 'No channel endpoint URL configured — set it in Settings → Salsify' });
  if (pullRunning) return res.status(409).json({ error: 'A pull is already running' });

  pullRunning = true;
  setJob('salsify_pull', 'running');
  setImmediate(() => runPull(result.key));
  res.json({ status: 'running' });
});

router.get('/pull/status', (_req: Request, res: Response) => {
  res.json(getJob('salsify_pull'));
});

// ── Push: calculated shipping dims/weight → Salsify products ─────────────────

interface PushTarget {
  id: string;
  shipped_dims: { height: number; width: number; length: number };
  billed_weight: number;
}

async function runPush(key: string, targets: PushTarget[], skippedUpfront: string[]) {
  const s = getSettings();
  const attrs = {
    length: s.salsify_attr_length || ATTR_DEFAULTS.salsify_attr_length,
    width: s.salsify_attr_width || ATTR_DEFAULTS.salsify_attr_width,
    height: s.salsify_attr_height || ATTR_DEFAULTS.salsify_attr_height,
    weight: s.salsify_attr_weight || ATTR_DEFAULTS.salsify_attr_weight,
  };
  const orgId = s.salsify_org_id;

  let pushed = 0, failed = 0;
  const errors: string[] = skippedUpfront.map(id => `${id}: no best-fit packaging — skipped`);

  try {
    for (const target of targets) {
      const url = `https://app.salsify.com/api/v1/orgs/${encodeURIComponent(orgId)}/products/${encodeURIComponent(target.id)}`;
      try {
        const response = await fetch(url, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            [attrs.length]: target.shipped_dims.length,
            [attrs.width]: target.shipped_dims.width,
            [attrs.height]: target.shipped_dims.height,
            [attrs.weight]: target.billed_weight,
          }),
        });
        if (response.ok) {
          pushed++;
        } else {
          failed++;
          if (errors.length < 100) errors.push(`${target.id}: HTTP ${response.status}`);
        }
      } catch (err) {
        failed++;
        if (errors.length < 100) errors.push(`${target.id}: ${err instanceof Error ? err.message : 'request failed'}`);
      }
      // Progress heartbeat + gentle pacing for the Salsify API
      if ((pushed + failed) % 25 === 0) {
        db.prepare('UPDATE report_cache SET payload = ? WHERE type = ?')
          .run(JSON.stringify({ progress: pushed + failed, total: targets.length }), 'salsify_push');
      }
      await new Promise<void>(resolve => setTimeout(resolve, 100));
    }

    setJob('salsify_push', 'ready', {
      total: targets.length, pushed, failed, skipped: skippedUpfront.length, errors,
    });
  } catch (err) {
    setJob('salsify_push', 'error', undefined, err instanceof Error ? err.message : 'Push failed');
  } finally {
    pushRunning = false;
  }
}

router.post('/push', (req: Request, res: Response) => {
  const result = actingUserKey(req);
  if ('error' in result) return res.status(result.code).json({ error: result.error });
  const s = getSettings();
  if (!s.salsify_org_id) return res.status(400).json({ error: 'No Salsify Org ID configured — set it in Settings → Salsify' });
  if (pushRunning) return res.status(409).json({ error: 'A push is already running' });

  const report = db.prepare("SELECT status, payload, computed_at FROM report_cache WHERE type = 'packaging_analysis'").get() as
    | { status: string; payload: string | null; computed_at: string | null }
    | undefined;
  if (!report || report.status !== 'ready' || !report.payload) {
    return res.status(400).json({ error: 'Run the Packaging Analysis report first — push uses its best-fit results' });
  }

  const { product_ids } = req.body as { product_ids?: string[] };
  const wanted = Array.isArray(product_ids) && product_ids.length > 0 ? new Set(product_ids) : null;

  const payload = JSON.parse(report.payload) as {
    product_results?: { id: string; shipped_dims: { height: number; width: number; length: number } | null; billed_weight: number | null }[];
  };
  const results = payload.product_results ?? [];

  const targets: PushTarget[] = [];
  const skipped: string[] = [];
  for (const entry of results) {
    if (wanted && !wanted.has(entry.id)) continue;
    if (entry.shipped_dims && entry.billed_weight != null) {
      targets.push({ id: entry.id, shipped_dims: entry.shipped_dims, billed_weight: entry.billed_weight });
    } else {
      skipped.push(entry.id);
    }
  }
  if (targets.length === 0) {
    return res.status(400).json({ error: 'No products with calculated shipping data to push' });
  }

  pushRunning = true;
  setJob('salsify_push', 'running', { progress: 0, total: targets.length });
  setImmediate(() => runPush(result.key, targets, skipped));
  res.json({ status: 'running', total: targets.length, report_computed_at: report.computed_at });
});

router.get('/push/status', (_req: Request, res: Response) => {
  res.json(getJob('salsify_push'));
});

export default router;

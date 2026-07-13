import express from 'express';
import cors from 'cors';
import path from 'path';
import productsRouter from './routes/products';
import packagingRouter from './routes/packaging';
import configuratorRouter from './routes/configurator';
import authRouter from './routes/auth';
import shippingRouter from './routes/shipping';
import db from './db';
import backupRouter, { createBackup, listRegularBackups, pruneOldBackups } from './routes/backup';
import reportsRouter, { computePackagingAnalysis } from './routes/reports';
import usersRouter from './routes/users';
import salsifyRouter from './routes/salsify';

const app = express();
const PORT = process.env.PORT ?? 3002;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/packaging', packagingRouter);
app.use('/api/configurator', configuratorRouter);
app.use('/api/shipping', shippingRouter);
app.use('/api/backup', backupRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/users', usersRouter);
app.use('/api/salsify', salsifyRouter);

// Scheduled auto-backup — checks every hour, respects frequency/hour/max-count settings.
async function runScheduledBackup() {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const s = Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value]));
    const frequency  = (s.backup_frequency  ?? 'daily') as 'daily' | 'weekly' | 'monthly';
    const targetHour = Number(s.backup_hour      ?? 2);
    const maxCount   = Number(s.backup_max_count ?? 7);

    const now = new Date();
    if (now.getHours() !== targetHour) return;

    const existing = listRegularBackups();
    if (existing.length > 0) {
      const lastMs = new Date(existing[0].created_at).getTime();
      const hoursSince = (now.getTime() - lastMs) / (1000 * 60 * 60);
      const minHours = frequency === 'monthly' ? 27 * 24 : frequency === 'weekly' ? 6 * 24 : 23;
      if (hoursSince < minHours) return;
    }

    const b = await createBackup();
    console.log(`[Backup] Auto-backup created: ${b.filename} (${(b.size / 1024).toFixed(1)} KB)`);
    pruneOldBackups(maxCount);
  } catch (err) {
    console.error('[Backup] Auto-backup failed:', err);
  }
}

setInterval(runScheduledBackup, 60 * 60 * 1000); // check every hour

// Scheduled packaging analysis — runs every 6 hours, checks every hour
function runScheduledAnalysis() {
  try {
    const cached = db
      .prepare("SELECT computed_at FROM report_cache WHERE type = 'packaging_analysis' AND status = 'ready'")
      .get() as { computed_at: string } | undefined;
    if (!cached) {
      computePackagingAnalysis();
      return;
    }
    const ageHours = (Date.now() - new Date(cached.computed_at).getTime()) / (1000 * 60 * 60);
    if (ageHours >= 6) computePackagingAnalysis();
  } catch (err) {
    console.error('[Reports] Scheduler error:', err);
  }
}

setInterval(runScheduledAnalysis, 60 * 60 * 1000); // check every hour

// On startup: run analysis if no cache exists or cache is stale
setTimeout(() => {
  try {
    const cached = db
      .prepare("SELECT computed_at FROM report_cache WHERE type = 'packaging_analysis' AND status = 'ready'")
      .get() as { computed_at: string } | undefined;
    if (!cached) {
      console.log('[Reports] No cached analysis found — running initial analysis...');
      computePackagingAnalysis();
      return;
    }
    const ageHours = (Date.now() - new Date(cached.computed_at).getTime()) / (1000 * 60 * 60);
    if (ageHours >= 6) {
      console.log(`[Reports] Cache is ${ageHours.toFixed(1)}h old — refreshing...`);
      computePackagingAnalysis();
    }
  } catch (err) {
    console.error('[Reports] Startup analysis check failed:', err);
  }
}, 5000); // 5s after startup so the server is fully ready

// Serve built React app in production
const clientBuild = path.join(__dirname, '../../client/dist');
app.use(express.static(clientBuild));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientBuild, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

import express from 'express';
import cors from 'cors';
import path from 'path';
import productsRouter from './routes/products';
import packagingRouter from './routes/packaging';
import configuratorRouter from './routes/configurator';
import authRouter from './routes/auth';
import shippingRouter from './routes/shipping';
import backupRouter, { createBackup } from './routes/backup';

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

// Auto-backup every 6 hours
const AUTO_BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
setInterval(async () => {
  try {
    const b = await createBackup();
    console.log(`[Backup] Auto-backup created: ${b.filename} (${(b.size / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error('[Backup] Auto-backup failed:', err);
  }
}, AUTO_BACKUP_INTERVAL_MS);

// Serve built React app in production
const clientBuild = path.join(__dirname, '../../client/dist');
app.use(express.static(clientBuild));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientBuild, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

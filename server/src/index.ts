import express from 'express';
import cors from 'cors';
import path from 'path';
import productsRouter from './routes/products';
import packagingRouter from './routes/packaging';
import configuratorRouter from './routes/configurator';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.use('/api/products', productsRouter);
app.use('/api/packaging', packagingRouter);
app.use('/api/configurator', configuratorRouter);

// Serve built React app in production
const clientBuild = path.join(__dirname, '../../client/dist');
app.use(express.static(clientBuild));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientBuild, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

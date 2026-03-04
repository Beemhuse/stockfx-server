import express from 'express';
import { json } from 'body-parser';
import { connectToDatabase } from './db/client';
import authRoutes from './routes/auth.routes';
import { config } from './config';

const app = express();
const PORT = config.port || 3000;

app.use(json());
app.use('/api/auth', authRoutes);

const startServer = async () => {
  try {
    await connectToDatabase();
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Error starting the server:', error);
  }
};

startServer();
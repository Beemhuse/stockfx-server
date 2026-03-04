import express from 'express';
import { connectToDatabase } from './db/client';
import { setupRoutes } from './routes/auth.routes';
import { config } from './config';

const app = express();

// Middleware to parse JSON requests
app.use(express.json());

// Connect to the database
connectToDatabase()
  .then(() => {
    console.log('Database connected successfully');
    
    // Setup routes
    setupRoutes(app);

    // Start the server
    const PORT = config.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });
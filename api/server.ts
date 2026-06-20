import app from './app.js';
import { initDb } from './src/db/init.js';

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  try {
    await initDb();
    const server = app.listen(PORT, () => {
      console.log(`Server ready on port ${PORT}`);
      console.log('API health check: http://localhost:3001/api/health');
    });

    process.on('SIGTERM', () => {
      console.log('SIGTERM signal received');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('SIGINT signal received');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();

export default app;

import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import { setupSwagger } from './swagger.js';
import healthRouter from './utils/health.js';
import authRoutes from './routes/AuthRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;


app.use(helmet());
app.use(cors({ origin: 'tauri://localhost' }));
app.use(express.json());

setupSwagger(app);


app.use('/health', healthRouter);
app.use('/auth', authRoutes);

app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}

export default app;
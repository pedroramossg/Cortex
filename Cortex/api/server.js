import express from 'express';
import dotenv from 'dotenv';
import { setupSwagger } from './swagger.js';
import healthRouter from './utils/health.js';

dotenv.config();
const app = express();

const port = process.env.PORT || 3000;

app.use(express.json())

setupSwagger(app);

app.use('/health', healthRouter);



if (process.env.NODE_ENV !== 'test') {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}

export default app;
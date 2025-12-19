import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import ingestRouter from './api/ingest';
import { authMiddleware } from './auth/middleware';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Routes
// Using Router now for /events, /suggestions, etc.
app.use('/', authMiddleware, ingestRouter);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0' });
});

app.listen(PORT, () => {
    console.log(`Ingestion Service running on port ${PORT}`);
});

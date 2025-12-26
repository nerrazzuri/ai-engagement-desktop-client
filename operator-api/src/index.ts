import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Import Routers
import { authRouter } from './api/auth';
import { workspaceRouter } from './api/workspace';
import { ownerRouter } from './api/owner';
import { suggestionsRouter } from './api/suggestions';
import { valueRouter } from './api/value';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(helmet());
app.use(cors()); // Allow all by default for operator UI dev
app.use(express.json());
app.use(morgan('dev'));

export const prisma = new PrismaClient();

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'operator-api' });
});

// Register Routes
app.use('/auth', authRouter);
app.use('/workspaces', workspaceRouter);
app.use('/owner', ownerRouter);
app.use('/suggestions', suggestionsRouter);
app.use('/value', valueRouter);

app.listen(port, () => {
    console.log(`[OperatorAPI] Server running on port ${port}`);
});

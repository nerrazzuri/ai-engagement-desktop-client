
import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

// Extend Express Request type
declare global {
    namespace Express {
        interface Request {
            correlationId: string;
        }
    }
}

class Logger {
    private formatMessage(level: string, message: string, meta?: any): string {
        const timestamp = new Date().toISOString();
        const logObject = {
            timestamp,
            level,
            message,
            env: config.env,
            ...meta
        };
        return JSON.stringify(logObject);
    }

    info(message: string, meta?: any) {
        console.log(this.formatMessage('INFO', message, meta));
    }

    error(message: string, meta?: any) {
        console.error(this.formatMessage('ERROR', message, meta));
    }

    warn(message: string, meta?: any) {
        console.warn(this.formatMessage('WARN', message, meta));
    }

    debug(message: string, meta?: any) {
        if (config.logLevel === 'debug') {
            console.debug(this.formatMessage('DEBUG', message, meta));
        }
    }
}

export const logger = new Logger();

// Middleware: Correlation ID Propagation
export const correlationMiddleware = (req: Request, res: Response, next: NextFunction) => {
    // 1. Check header
    let correlationId = req.headers['x-correlation-id'] as string;

    // 2. Generate if missing (Edge Role)
    if (!correlationId) {
        correlationId = uuidv4();
    }

    // 3. Attach to request
    req.correlationId = correlationId;

    // 4. Attach to response (Propagate downstream/client)
    res.setHeader('X-Correlation-Id', correlationId);

    // 5. Log Request Start (Structured)
    logger.info(`Incoming Request: ${req.method} ${req.url}`, {
        correlationId,
        ip: req.ip,
        userAgent: req.get('user-agent')
    });

    next();
};

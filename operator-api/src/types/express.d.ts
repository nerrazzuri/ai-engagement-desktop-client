import { Session, User } from '@prisma/client';

declare global {
    namespace Express {
        interface Request {
            session?: Session;
            user?: User;
            activeWorkspaceId?: string;
        }
    }
}

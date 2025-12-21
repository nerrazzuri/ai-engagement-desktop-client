
import { Session, User } from '@prisma/client';

declare global {
    namespace Express {
        interface Request {
            user?: User;
            session?: Session;
            activeWorkspaceId?: string;
        }
    }
}

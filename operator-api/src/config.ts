import dotenv from 'dotenv';
dotenv.config();

export const config = {
    bcryptRounds: 10,
    jwtSecret: process.env.JWT_SECRET || 'dev_secret_operator_api',
    port: process.env.PORT || 3001,
};

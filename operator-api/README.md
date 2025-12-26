# Operator API

Backend service for the Operator UI, providing authentication, workspace management, and manual suggestion handling.

## Setup

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Environment Configuration**
    Create a `.env` file based on your `ingestion-service` configuration:
    ```
    DATABASE_URL=postgresql://user:password@localhost:5432/ai_backend_db?schema=engagement
    JWT_SECRET=your_secret_key
    PORT=3001
    ```

3.  **Run Service**
    ```bash
    # Development
    npm run dev

    # Production
    npm run build
    npm start
    ```

## Functionality

-   **Auth**: Login (Email/Password), Session Management.
-   **Workspaces**: List and Switch active workspaces.
-   **Owner Settings**: Configure Mode (Observe/Suggest/Assist), Aggressiveness, Limits.
-   **Suggestions**: List Queue, View Detail (with Explainability), Mark as Posted, Reject.
-   **Analytics**: Value Dashboard (Time stats).

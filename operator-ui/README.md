# Operator UI

Web interface for business owners to manually operate the AI agent.

## Setup

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Configuration**
    The app connects to `operator-api` at `http://localhost:3001` by default via Vite proxy.
    See `vite.config.ts`.

3.  **Run App**
    ```bash
    npm run dev
    ```

## Features

-   **Login**: Secure access.
-   **Dashboard**: High-level value metrics.
-   **Queue**: Review pending AI suggestions.
-   **Detail View**: See context, AI explanation, and take action (Copy/Post/Reject).
-   **Settings**: Tune the AI behavior.

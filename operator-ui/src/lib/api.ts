
export const API_BASE = '/api'; // Proxied by Vite

export class Client {
    private static token: string | null = localStorage.getItem('op_token');

    static setToken(token: string) {
        this.token = token;
        localStorage.setItem('op_token', token);
    }

    static getToken() {
        return this.token;
    }

    static removeToken() {
        this.token = null;
        localStorage.removeItem('op_token');
    }

    static async request(endpoint: string, options: RequestInit = {}) {
        const headers = new Headers(options.headers);
        if (this.token) {
            headers.set('Authorization', `Bearer ${this.token}`);
        }
        headers.set('Content-Type', 'application/json');

        const res = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });

        if (res.status === 401) {
            // Unauth - verify if it's not the login page
            if (!window.location.pathname.includes('/login')) {
                this.removeToken();
                window.location.href = '/login';
            }
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || 'API Error');
        }

        return res.json();
    }

    static get(endpoint: string) {
        return this.request(endpoint, { method: 'GET' });
    }

    static post(endpoint: string, body: any) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    static put(endpoint: string, body: any) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }
}

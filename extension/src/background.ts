import { v4 as uuidv4 } from 'uuid';

const API_URL = 'http://localhost:3000';

// ==========================================
// 1. Install Identity Management
// ==========================================
async function getInstallId(): Promise<string> {
    const result = await chrome.storage.local.get('install_id');
    if (result.install_id && typeof result.install_id === 'string') {
        return result.install_id;
    }

    const newId = uuidv4();
    await chrome.storage.local.set({ install_id: newId });
    return newId;
}

// Mock Token Generation (In real world, this would be an exchange flow)
async function getAuthHeaders(): Promise<HeadersInit> {
    const id = await getInstallId();
    // In Phase 11, we just mock this. Real token would be fetched from server.
    const token = `token-for-${id}`; // Matches mock middleware expectation

    return {
        'Content-Type': 'application/json',
        'x-install-id': id,
        'Authorization': `Bearer ${token}`
    };
}

// Helper to handle API responses
async function handleApiResponse(response: Response) {
    if (!response.ok) {
        if (response.status === 403) {
            return { error: '403 Forbidden - Kill Switch Triggered' };
        }
        throw new Error(`API Error: ${response.status}`);
    }
    const data = await response.json();
    console.log('[Background] API Response:', data);
    return data;
}

// ==========================================
// 2. Message Handling (from Content Script)
// ==========================================
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
        try {
            if (message.type === 'CAPTURE_EVENT') {
                // Enrich payload securely (if content script didn't set it)
                if (!message.payload.session) message.payload.session = {};
                message.payload.session.install_id = await getInstallId();

                const response = await fetch(`${API_URL}/events`, {
                    method: 'POST',
                    headers: await getAuthHeaders(),
                    body: JSON.stringify(message.payload)
                });
                sendResponse(await handleApiResponse(response));
            } else if (message.type === 'GET_SUGGESTION') {
                const response = await fetch(`${API_URL}/suggestions`, {
                    method: 'POST',
                    headers: await getAuthHeaders(),
                    body: JSON.stringify(message.payload)
                });
                sendResponse(await handleApiResponse(response));
            } else if (message.type === 'SEND_FEEDBACK') {
                const response = await fetch(`${API_URL}/feedback`, {
                    method: 'POST',
                    headers: await getAuthHeaders(),
                    body: JSON.stringify(message.payload)
                });
                sendResponse(await handleApiResponse(response));
            } else {
                sendResponse({ status: 'error', message: 'Unknown message type' });
            }
        } catch (error: any) {
            console.error('[Background] Failed to handle message:', error);
            sendResponse({ status: 'error', message: error.message });
        }
    })();
    return true; // Keep channel open for async response
});

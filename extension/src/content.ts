import { v4 as uuidv4 } from 'uuid';

console.log('[Content] AI Engagement Eyes Loaded');

let currentVideoId: string | null = null;
const session_id = uuidv4();

// State
let lastCommentText = '';

// Check disabled state on load
chrome.storage.local.get('KILL_SWITCH_ACTIVE', (result) => {
    if (result && result.KILL_SWITCH_ACTIVE) {
        disableExtensionForCompliance();
    }
});

// J1: Compliance Kill Switch (Persistent)
let isDisabled = false;
function disableExtensionForCompliance() {
    isDisabled = true;
    chrome.storage.local.set({ KILL_SWITCH_ACTIVE: true }); // Persist to disk

    if (!overlay) return;

    (overlay.querySelector('#ai-trigger-area') as HTMLElement).style.display = 'none';
    (overlay.querySelector('#ai-result-area') as HTMLElement).style.display = 'none';
    (overlay.querySelector('#ai-disabled-msg') as HTMLElement).style.display = 'block';
    updateOverlayStatus("DISABLED - CONTACT ADMIN");
}

// ==========================================
// 1. YouTube Observer & UI
// ==========================================
function getVideoId(url: string): string | null {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('v');
}

function detectVideoChange() {
    const newVideoId = getVideoId(window.location.href);
    if (newVideoId && newVideoId !== currentVideoId) {
        currentVideoId = newVideoId;
        console.log('[Content] Detect Video:', currentVideoId);
        injectOverlay(); // Show overlay, but DO NOT send event yet (B2/D1)
        resetOverlayState();
    }
}

// Observe URL changes
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        detectVideoChange();
    }
}).observe(document, { subtree: true, childList: true });

// Listen for Comment Interaction (C1, C2)
document.addEventListener('focusin', (e) => {
    const target = e.target as HTMLElement;
    if (isCommentInput(target)) {
        console.log('[Content] Comment Focus (Local Record)'); // C1
        lastCommentText = target.innerText;
    }
});

document.addEventListener('input', (e) => {
    const target = e.target as HTMLElement;
    if (isCommentInput(target)) {
        lastCommentText = target.innerText;
        // C2: Raw capture locally, no send.
    }
});

function isCommentInput(target: HTMLElement) {
    return target.id === 'contenteditable-root' || target.getAttribute('role') === 'textbox';
}

// Initial check
detectVideoChange();

// ==========================================
// 2. Messaging to Background
// ==========================================
let currentSessionId: string | null = null;
let currentEventId: string | null = null;

async function sendCaptureEvent(event: any) {
    if (event && event.context && event.context.user_action !== 'manual_trigger') {
        console.error('[Invariant Violation] Attempted to send event without manual trigger!');
        return;
    }

    if (isDisabled) {
        console.warn('[Content] Extension is disabled via Kill Switch.');
        return;
    }

    try {
        updateOverlayStatus("Analyzing...");

        // Step 1: Ingest Event
        const ingestResp = await chrome.runtime.sendMessage({
            type: 'CAPTURE_EVENT',
            payload: event
        });

        if (handleError(ingestResp)) return;

        if (ingestResp && ingestResp.event_id) {
            currentEventId = ingestResp.event_id;

            // Step 2: Request Suggestion
            const suggestResp = await chrome.runtime.sendMessage({
                type: 'GET_SUGGESTION',
                payload: { event_id: currentEventId }
            });

            if (handleError(suggestResp)) return;

            if (suggestResp && suggestResp.text) {
                currentSessionId = suggestResp.session_id;
                updateOverlayRecommendation(suggestResp.text);
            } else {
                updateOverlayStatus("No suggestion.");
            }
        }
    } catch (err: any) {
        console.error('[Content] Flow failed:', err);
        updateOverlayStatus("Error connecting.");
    }
}

function handleError(response: any): boolean {
    if (chrome.runtime.lastError) {
        console.error('[Content] Transport error:', chrome.runtime.lastError);
        updateOverlayStatus("Connection Error");
        return true;
    }
    if (response && response.error && response.error.includes('403')) {
        disableExtensionForCompliance();
        return true;
    }
    return false;
}

async function sendFeedback(action: string, finalText: string) {
    if (!currentSessionId) return;
    chrome.runtime.sendMessage({
        type: 'SEND_FEEDBACK',
        payload: { session_id: currentSessionId, action, final_text: finalText }
    });
}


// ==========================================
// 3. UI Overlay
// ==========================================
let overlay: HTMLElement | null = null;

function injectOverlay() {
    if (overlay) return;

    overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '320px',
        padding: '16px',
        background: '#1a1a1a',
        color: '#fff',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        zIndex: '99999',
        fontFamily: 'system-ui, sans-serif',
        display: 'none'
    });

    overlay.innerHTML = `
    <div style="font-weight:bold; margin-bottom:8px; display:flex; justify-content:space-between;">
        <span>AI Insight</span>
        <span id="ai-status" style="font-size:12px; color:#aaa; font-weight:normal">Idle</span>
    </div>
    
    <!-- Manual Trigger Area -->
    <div id="ai-trigger-area" style="margin-bottom:12px;">
        <p style="font-size:12px; color:#ccc; margin-bottom:8px;">
            Draft a comment and ask AI for engagement tips.
        </p>
        <button id="ai-get-suggestion" style="width:100%; padding:8px; background:#2563eb; border:none; color:white; border-radius:6px; cursor:pointer; font-weight:bold;">
            Get AI Suggestion
        </button>
    </div>

    <!-- Recommendation Area (Hidden initially) -->
    <div id="ai-result-area" style="display:none; margin-bottom:12px;">
        <div id="ai-text" style="font-size:14px; margin-bottom:12px; padding:8px; background:#333; border-radius:6px;"></div>
        <div style="display:flex; gap:8px">
            <button id="ai-copy-send" style="flex:1; padding:6px; background:#10b981; border:none; color:white; border-radius:6px; cursor:pointer">Copy & Log</button>
            <button id="ai-dismiss" style="padding:6px; background:#444; border:none; color:white; border-radius:6px; cursor:pointer">Reset</button>
        </div>
    </div>
    
    <div id="ai-disabled-msg" style="display:none; color: #ef4444; font-weight:bold; text-align:center;">
        EXTENSION DISABLED BY SERVER
    </div>

    <button id="ai-close" style="position:absolute; top:8px; right:8px; background:none; border:none; color:#666; cursor:pointer; font-size:10px;">✕</button>
  `;

    document.body.appendChild(overlay);

    // Bind Events
    overlay.querySelector('#ai-close')?.addEventListener('click', () => {
        if (overlay) overlay.style.display = 'none';
    });

    overlay.querySelector('#ai-get-suggestion')?.addEventListener('click', () => {
        // D1: Manual Trigger -> Send Event
        const payload = constructEvent();
        sendCaptureEvent(payload);
    });

    overlay.querySelector('#ai-dismiss')?.addEventListener('click', () => {
        resetOverlayState();
    });

    overlay.querySelector('#ai-copy-send')?.addEventListener('click', () => {
        // G1: Manual Copy / Insert
        const text = overlay?.querySelector('#ai-text')?.textContent || '';
        navigator.clipboard.writeText(text);

        // Phase 12.4 Feedback
        sendFeedback('COPY', text);

        alert(`[MOCK] Copied to clipboard:\n"${text}"\n\n(User must manually paste)`);
        console.log('[MOCK_SEND] User manually processed suggestion.');

        updateOverlayStatus("Logged!");
        setTimeout(() => resetOverlayState(), 2000);
    });
}

function constructEvent() {
    return {
        event_type: 'DESKTOP_CAPTURE',
        platform: 'youtube',
        session: { session_id },
        page: {
            url: window.location.href,
            page_type: 'VIDEO',
            timestamp: new Date().toISOString()
        },
        video: {
            video_id: currentVideoId || 'unknown',
            video_url: window.location.href,
            title: document.title,
            author_id: null,
            author_name: null
        },
        comment: { // Send whatever was typed or focused
            comment_id: 'draft-comment',
            author_id: 'local-user',
            author_name: 'Me',
            text: lastCommentText || '(No text typed)',
        },
        context: {
            visible: true,
            position: 'viewport',
            user_action: 'manual_trigger'
        },
        client_meta: {
            extension_version: '1.0.0',
            browser: 'chrome',
            os: 'windows'
        }
    };
}

function resetOverlayState() {
    if (!overlay) return;
    overlay.style.display = 'block';

    if (isDisabled) {
        disableExtensionForCompliance(); // Keep disabled if state set
        return;
    }

    (overlay.querySelector('#ai-trigger-area') as HTMLElement).style.display = 'block';
    (overlay.querySelector('#ai-result-area') as HTMLElement).style.display = 'none';
    updateOverlayStatus("Idle");
}

function updateOverlayStatus(status: string) {
    if (!overlay) return;
    const el = overlay.querySelector('#ai-status');
    if (el) el.textContent = status;
}

function updateOverlayRecommendation(text: string) {
    if (!overlay) return;
    const trigger = overlay.querySelector('#ai-trigger-area') as HTMLElement;
    const result = overlay.querySelector('#ai-result-area') as HTMLElement;

    trigger.style.display = 'none';
    result.style.display = 'block';

    const textBox = overlay.querySelector('#ai-text');
    if (textBox) textBox.textContent = text;
    updateOverlayStatus("Suggested");
}

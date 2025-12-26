
import React, { useState } from 'react';
import { Client } from '../lib/api';
import { X, Copy, ExternalLink, Check, ThumbsDown } from 'lucide-react';

interface Props {
    suggestion: any;
    onClose: () => void;
    onUpdate: () => void;
}

export function SuggestionDetail({ suggestion, onClose, onUpdate }: Props) {
    const [reason, setReason] = useState('');
    const [showRejectInput, setShowRejectInput] = useState(false);

    if (!suggestion) return null;

    const handleCopy = () => {
        navigator.clipboard.writeText(suggestion.suggested_text);
        // Optional: toast
    };

    const handlePost = async () => {
        if (!confirm('Did you post this reply? This will resolve the suggestion.')) return;
        await Client.post(`/suggestions/${suggestion.id}/decision`, { decision: 'POST' });
        onUpdate();
        onClose();
    };

    const handleReject = async () => {
        if (!showRejectInput) {
            setShowRejectInput(true);
            return;
        }
        await Client.post(`/suggestions/${suggestion.id}/decision`, { decision: 'REJECT', reason });
        onUpdate();
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-lg">Suggestion Details</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1 space-y-6">

                    {/* ID & Meta */}
                    <div className="text-xs text-gray-400 font-mono">ID: {suggestion.id}</div>

                    {/* Context */}
                    <div className="bg-gray-50 p-4 rounded border">
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Original Comment</div>
                        <p className="text-gray-800 whitespace-pre-wrap">"{suggestion.event?.content_text}"</p>
                        {suggestion.event?.metadata && (
                            <div className="mt-2 text-xs text-blue-600 flex items-center gap-1 cursor-pointer">
                                <ExternalLink className="w-3 h-3" />
                                Open on Platform
                            </div>
                        )}
                    </div>

                    {/* AI Analysis */}
                    {suggestion.explanation && (
                        <div className="bg-purple-50 p-4 rounded border border-purple-100">
                            <div className="text-xs font-semibold text-purple-600 uppercase mb-2">AI Analysis</div>
                            <p className="text-sm text-purple-800">{suggestion.explanation.summary}</p>
                            <div className="mt-2 flex gap-4 text-xs text-purple-700">
                                <div>Intent: <b>{suggestion.explanation.detected_intent}</b></div>
                                <div>Confidence: <b>{(suggestion.confidence * 100).toFixed(0)}%</b></div>
                            </div>
                        </div>
                    )}

                    {/* Suggestion */}
                    <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-2 flex justify-between">
                            <span>Suggested Reply</span>
                            <button onClick={handleCopy} className="text-blue-600 flex items-center gap-1 hover:underline">
                                <Copy className="w-3 h-3" /> Copy
                            </button>
                        </div>
                        <div className="p-4 bg-white border border-blue-200 rounded-lg shadow-sm text-lg">
                            {suggestion.suggested_text}
                        </div>
                    </div>

                    {/* Reject Input */}
                    {showRejectInput && (
                        <div>
                            <label className="block text-sm font-medium mb-1 text-red-600">Rejection Reason</label>
                            <textarea
                                className="w-full p-2 border border-red-200 rounded"
                                placeholder="Why is this suggestion bad?"
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                            />
                        </div>
                    )}

                </div>

                {/* Actions */}
                <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                    <button
                        onClick={handleReject}
                        className="px-4 py-2 text-red-600 hover:bg-red-50 rounded border border-transparent hover:border-red-200"
                    >
                        {showRejectInput ? 'Confirm Reject' : 'Reject'}
                    </button>
                    {!showRejectInput && (
                        <button
                            onClick={handlePost}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
                        >
                            <Check className="w-4 h-4" />
                            Mark as Posted
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

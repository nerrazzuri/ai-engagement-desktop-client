
import React, { useEffect, useState } from 'react';
import { Client } from '../lib/api';
import { SuggestionDetail } from '../components/SuggestionDetail';
import { Filter } from 'lucide-react';

export function Suggestions() {
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('PENDING'); // PENDING | RESOLVED | REJECTED
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const loadData = async () => {
        try {
            setLoading(true);
            const data = await Client.get(`/suggestions?status=${filter}`);
            setSuggestions(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [filter]);

    const selectedCard = suggestions.find(s => s.id === selectedId);

    // Fetch full detail when selected (to get explanation)
    const [detailData, setDetailData] = useState<any>(null);
    useEffect(() => {
        if (selectedId) {
            Client.get(`/suggestions/${selectedId}`).then(setDetailData);
        } else {
            setDetailData(null);
        }
    }, [selectedId]);

    return (
        <div className="flex h-full flex-col">
            {/* Toolbar */}
            <div className="p-4 border-b bg-white flex justify-between items-center">
                <h2 className="text-xl font-bold">Suggestions Queue</h2>
                <div className="flex items-center gap-2 bg-gray-100 p-1 rounded">
                    {['PENDING', 'RESOLVED', 'REJECTED'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1 rounded text-sm font-medium ${filter === f ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-auto p-4">
                {loading ? <div>Loading...</div> : (
                    <table className="w-full bg-white border rounded shadow-sm">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="text-left p-3 text-sm font-semibold text-gray-500">Time</th>
                                <th className="text-left p-3 text-sm font-semibold text-gray-500">Platform</th>
                                <th className="text-left p-3 text-sm font-semibold text-gray-500">Context</th>
                                <th className="text-left p-3 text-sm font-semibold text-gray-500">Suggestion</th>
                                <th className="text-left p-3 text-sm font-semibold text-gray-500">Confidence</th>
                                <th className="w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {suggestions.map(s => (
                                <tr key={s.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedId(s.id)}>
                                    <td className="p-3 text-sm text-gray-500 whitespace-nowrap">
                                        {new Date(s.created_at).toLocaleTimeString()}
                                    </td>
                                    <td className="p-3 text-sm text-gray-600">{s.platform}</td>
                                    <td className="p-3 text-sm text-gray-800 max-w-xs truncate">
                                        {/* We might not have event content here if not joined in list. 
                                            If API list doesn't include event, we show placeholder or update API.
                                            Let's blindly assume API returns basic event data or we update API. 
                                            API calls `prisma.suggestion.findMany`. It doesn't `include: { event: true }`.
                                            I should update `SuggestionService.listSuggestions`!
                                         */}
                                        ID: {s.event_id.substring(0, 8)}...
                                    </td>
                                    <td className="p-3 text-sm text-gray-800 max-w-md truncate font-medium">
                                        {s.suggested_text}
                                    </td>
                                    <td className="p-3 text-sm">
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${s.confidence > 0.8 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                            {(s.confidence * 100).toFixed(0)}%
                                        </span>
                                    </td>
                                    <td className="p-3 text-right">
                                        <button className="text-blue-600 text-sm font-medium">Review</button>
                                    </td>
                                </tr>
                            ))}
                            {suggestions.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-gray-400">
                                        No suggestions found for this filter.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Detail Modal */}
            {selectedId && detailData && (
                <SuggestionDetail
                    suggestion={detailData}
                    onClose={() => setSelectedId(null)}
                    onUpdate={loadData}
                />
            )}
        </div>
    );
}

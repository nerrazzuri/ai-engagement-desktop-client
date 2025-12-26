
import { useEffect, useState } from 'react';
import { Client } from '../lib/api';
import { CheckCircle, MessageSquare, AlertCircle } from 'lucide-react';

export function Dashboard() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Client.get('/value/analytics')
            .then(setStats)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="p-8">Loading stats...</div>;

    const cards = [
        { label: 'Total Suggestions', value: stats?.total_suggestions, icon: MessageSquare, color: 'text-blue-600', bg: 'bg-blue-100' },
        { label: 'Pending Review', value: stats?.pending_reviews, icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-100' },
        { label: 'Manually Posted', value: stats?.manual_posts, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100' },
        // { label: 'Strategy Usage', value: stats?.answer_strategy_count, icon: BarChart3, color: 'text-purple-600', bg: 'bg-purple-100' },
    ];

    return (
        <div className="p-8">
            <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {cards.map((card, i) => (
                    <div key={i} className="bg-white p-6 rounded shadow-sm border flex items-center">
                        <div className={`p-4 rounded-full mr-4 ${card.bg}`}>
                            <card.icon className={`w-8 h-8 ${card.color}`} />
                        </div>
                        <div>
                            <div className="text-sm text-gray-500 font-medium">{card.label}</div>
                            <div className="text-3xl font-bold">
                                {card.value !== undefined ? card.value : '-'}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {!stats && (
                <div className="mt-8 p-4 bg-gray-50 border rounded text-center text-gray-500">
                    Data Unavailable. Please check connection.
                </div>
            )}
        </div>
    );
}

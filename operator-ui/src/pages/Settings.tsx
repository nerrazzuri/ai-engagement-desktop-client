import { useEffect, useState } from 'react';
import { Client } from '../lib/api';

export function Settings() {
    const [settings, setSettings] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [success, setSuccess] = useState('');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const data = await Client.get('/owner/settings');
            setSettings(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field: string, value: any) => {
        setSettings({ ...settings, [field]: value });
    };

    const handleSave = async () => {
        try {
            await Client.put('/owner/settings', settings);
            setSuccess('Settings saved successfully');
            setTimeout(() => setSuccess(''), 3000);
        } catch (e: any) {
            alert(e.message);
        }
    };

    if (loading || !settings) return <div className="p-8">Loading settings...</div>;

    return (
        <div className="p-8 max-w-4xl">
            <h2 className="text-2xl font-bold mb-6">Owner Settings</h2>

            {success && <div className="p-4 mb-4 bg-green-100 text-green-700 rounded">{success}</div>}

            <div className="bg-white p-6 rounded shadow-sm border space-y-6">

                {/* Mode */}
                <div>
                    <label className="block text-sm font-medium mb-1">Engagement Mode</label>
                    <select
                        className="w-full max-w-xs p-2 border rounded"
                        value={settings.mode}
                        onChange={e => handleChange('mode', e.target.value)}
                    >
                        <option value="OBSERVE_ONLY">Observe Only</option>
                        <option value="SUGGEST">Suggest</option>
                        <option value="ASSIST">Assist (Auto-Post)</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Controls the automation level of the agent.</p>
                </div>

                {/* Aggressiveness */}
                <div>
                    <label className="block text-sm font-medium mb-1">Aggressiveness</label>
                    <select
                        className="w-full max-w-xs p-2 border rounded"
                        value={settings.aggressiveness}
                        onChange={e => handleChange('aggressiveness', e.target.value)}
                    >
                        <option value="CONSERVATIVE">Conservative</option>
                        <option value="BALANCED">Balanced</option>
                        <option value="ASSERTIVE">Assertive</option>
                    </select>
                </div>

                {/* Limits */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Max Suggestions / Day</label>
                        <input
                            type="number"
                            className="w-full p-2 border rounded"
                            value={settings.max_suggestions_per_day}
                            onChange={e => handleChange('max_suggestions_per_day', parseInt(e.target.value))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Max Per Video</label>
                        <input
                            type="number"
                            className="w-full p-2 border rounded"
                            value={settings.max_suggestions_per_video}
                            onChange={e => handleChange('max_suggestions_per_video', parseInt(e.target.value))}
                        />
                    </div>
                </div>

                {/* Tone */}
                <div>
                    <label className="block text-sm font-medium mb-1">Preferred Tone</label>
                    <input
                        type="text"
                        placeholder="e.g. Friendly, Professional, Wittty"
                        className="w-full p-2 border rounded"
                        value={settings.tone || ''}
                        onChange={e => handleChange('tone', e.target.value)}
                    />
                </div>

                <div className="pt-4 border-t">
                    <button
                        onClick={handleSave}
                        className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
                    >
                        Save Configuration
                    </button>
                </div>

            </div>
        </div>
    );
}

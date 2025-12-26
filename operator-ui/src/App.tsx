
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Suggestions } from './pages/Suggestions';
import { Settings } from './pages/Settings';

// Placeholder components until created
const DashboardPlaceholder = () => <div className="p-8">Dashboard Loading...</div>;
const SuggestionsPlaceholder = () => <div className="p-8">Suggestions Loading...</div>;
const SettingsPlaceholder = () => <div className="p-8">Settings Loading...</div>;

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<Layout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="suggestions" element={<Suggestions />} />
                    <Route path="settings" element={<Settings />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;

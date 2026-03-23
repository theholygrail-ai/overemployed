import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WebSocketProvider } from './hooks/useWebSocket';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import JobList from './components/JobList';
import Scheduler from './components/Scheduler';
import AgentMonitor from './components/AgentMonitor';
import Settings from './components/Settings';
import Profile from './components/Profile';
import HITLPanel from './components/HITLPanel';
import HITLDetail from './components/HITLDetail';

export default function App() {
  return (
    <BrowserRouter>
      <WebSocketProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/jobs" element={<JobList />} />
            <Route path="/scheduler" element={<Scheduler />} />
            <Route path="/monitor" element={<AgentMonitor />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/interventions" element={<HITLPanel />} />
            <Route path="/interventions/:id" element={<HITLDetail />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
      </WebSocketProvider>
    </BrowserRouter>
  );
}

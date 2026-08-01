import React from 'react';
import { createRoot } from 'react-dom/client';
import ReportsDashboard from './components/ReportsDashboard';
import './index.css'; // Load global Tailwind CSS

const root = document.getElementById('react-reports-root');
if (root) {
  createRoot(root).render(<ReportsDashboard />);
}

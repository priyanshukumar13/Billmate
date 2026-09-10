import React from 'react';
import { createRoot } from 'react-dom/client';
import FloatingAssistant from './components/FloatingAssistant';
import ReceiptScanner from './components/ReceiptScanner';

// Mount Floating AI Assistant dynamically
const assistantRoot = document.getElementById('react-assistant-root');
if (assistantRoot) {
  createRoot(assistantRoot).render(<FloatingAssistant />);
}

// Mount Receipt Scanner dynamically
const scannerRoot = document.getElementById('react-receipt-scanner-root');
if (scannerRoot) {
  createRoot(scannerRoot).render(<ReceiptScanner />);
}

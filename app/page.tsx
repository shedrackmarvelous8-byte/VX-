'use client';

import React from 'react';
import { App } from '../src/app/App';
import { ToastProvider } from '../src/components/ui/Toast';
import { AuthProvider } from '../src/context/AuthContext';

export default function HomePage() {
  return (
    <AuthProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AuthProvider>
  );
}

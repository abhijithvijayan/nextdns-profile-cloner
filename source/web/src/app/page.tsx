'use client';

import {AuthProvider, useAuth} from '@/contexts/AuthContext';
import {LoginForm} from '@/components/LoginForm';
import {Dashboard} from '@/components/Dashboard';

function AppContent() {
  const {apiKey, isLoading} = useAuth();

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p>Loading...</p>
      </div>
    );
  }

  return apiKey ? <Dashboard /> : <LoginForm />;
}

export default function Home() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

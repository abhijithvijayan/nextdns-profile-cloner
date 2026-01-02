'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import styles from './LoginForm.module.scss';

export function LoginForm() {
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!apiKey.trim()) {
      setError('API key is required');
      return;
    }

    setIsLoading(true);
    setError('');

    const success = await login(apiKey.trim());

    if (!success) {
      setError('Invalid API key. Please check and try again.');
    }

    setIsLoading(false);
  };

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>NextDNS Manager</h1>
          <p className={styles.subtitle}>
            Bulk manage your NextDNS profiles with ease
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <Input
            label="API Key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your NextDNS API key"
            error={error}
            hint={
              <span>
                Get your API key from{' '}
                <a
                  href="https://my.nextdns.io/account"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  my.nextdns.io/account
                </a>
              </span>
            }
            fullWidth
            autoFocus
          />

          <Button type="submit" isLoading={isLoading} fullWidth size="large">
            Connect
          </Button>
        </form>

        <div className={styles.features}>
          <h4>Features</h4>
          <ul>
            <li>Manage domains across all profiles</li>
            <li>Compare profile settings side by side</li>
            <li>Sync allowlists and denylists</li>
            <li>Clone profiles to other accounts</li>
          </ul>
        </div>

        <a
          href="https://github.com/abhijithvijayan/nextdns-manager"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.githubLink}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          View on GitHub
        </a>
      </Card>
    </div>
  );
}

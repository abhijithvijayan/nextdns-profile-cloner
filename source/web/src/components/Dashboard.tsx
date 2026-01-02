'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from './Button';
import { ManageDomain } from './features/ManageDomain';
import { DiffProfiles } from './features/DiffProfiles';
import { SyncLists } from './features/SyncLists';
import { CopyProfile } from './features/CopyProfile';
import styles from './Dashboard.module.scss';

type Tab = 'manage' | 'diff' | 'sync' | 'copy';

const TABS: { id: Tab; label: string; description: string }[] = [
  {
    id: 'manage',
    label: 'Manage Domains',
    description: 'Add, remove, enable or disable domains across profiles',
  },
  {
    id: 'diff',
    label: 'Compare Profiles',
    description: 'View differences between your profiles',
  },
  {
    id: 'sync',
    label: 'Sync Lists',
    description: 'Synchronize allowlists and denylists across profiles',
  },
  {
    id: 'copy',
    label: 'Copy Profile',
    description: 'Clone a profile to another account',
  },
];

export function Dashboard() {
  const { profiles, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('manage');

  const renderContent = () => {
    switch (activeTab) {
      case 'manage':
        return <ManageDomain />;
      case 'diff':
        return <DiffProfiles />;
      case 'sync':
        return <SyncLists />;
      case 'copy':
        return <CopyProfile />;
    }
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.brand}>
            <h1>NextDNS Manager</h1>
            <span className={styles.profileCount}>
              {profiles.length} profile{profiles.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className={styles.headerActions}>
            <a
              href="https://github.com/abhijithvijayan/nextdns-manager"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.githubLink}
              aria-label="View on GitHub"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
            <Button variant="ghost" size="small" onClick={logout}>
              Disconnect
            </Button>
          </div>
        </div>
      </header>

      <nav className={styles.nav}>
        <div className={styles.tabs}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className={styles.main}>
        <div className={styles.tabHeader}>
          <h2>{TABS.find((t) => t.id === activeTab)?.label}</h2>
          <p>{TABS.find((t) => t.id === activeTab)?.description}</p>
        </div>
        {renderContent()}
      </main>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface Client {
  id: number;
  name: string;
  table_name: string;
}


interface PersistentFiltersProps {
  onClientChange?: (clientId: number | null, tableName: string | null) => void;
}

export function PersistentFilters({ 
  onClientChange
}: PersistentFiltersProps) {
  const [clientId, setClientId] = useState<string>('');
  const [clientTableName, setClientTableName] = useState<string>('');
  
  const [clients, setClients] = useState<Client[]>([]);
  
  const [loadingClients, setLoadingClients] = useState(false);

  // Auto-load clients on component mount
  useEffect(() => {
    const fetchClients = async () => {
      setLoadingClients(true);
      try {
        const response = await api.get('/client');
        if (!response.ok) {
          // Don't show alert for 401 - redirect to login will handle it
          if (response.status === 401) {
            return;
          }
          throw new Error('Failed to fetch clients');
        }
        const result = await response.json();
        setClients(result.clients || []);
      } catch (error) {
        console.error('Error fetching clients:', error);
        // Only show alert if it's not a 401 (which triggers redirect)
        alert('Failed to fetch clients. Please check if the backend is running.');
      } finally {
        setLoadingClients(false);
      }
    };

    fetchClients();
  }, []);


  const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    setClientId(selectedId);
    
    // Find the selected client to get its table_name
    const selectedClient = clients.find(c => c.id.toString() === selectedId);
    if (selectedClient) {
      setClientTableName(selectedClient.table_name);
      onClientChange?.(parseInt(selectedId), selectedClient.table_name);
    } else {
      setClientTableName('');
      onClientChange?.(null, null);
    }
  };

  return (
    <div className="flex gap-2 items-end flex-shrink-0 flex-wrap max-w-full" style={{ maxWidth: 'calc(100vw - 2rem)' }}>
      {/* Client Selection */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--foreground)] block">
          Client
        </label>
        <div className="relative">
          <select
            value={clientId}
            onChange={handleClientChange}
            className="w-40 px-2.5 py-1.5 pr-7 border border-[var(--input-border)] rounded-md bg-[var(--input-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loadingClients || clients.length === 0}
          >
            <option value="">{loadingClients ? 'Loading...' : 'Select client'}</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name} (ID: {client.id})
              </option>
            ))}
          </select>
          {loadingClients && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--secondary)] animate-spin" />
          )}
          {!loadingClients && (
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--secondary)] pointer-events-none" />
          )}
        </div>
      </div>

    </div>
  );
}


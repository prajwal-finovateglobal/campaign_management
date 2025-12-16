'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { DispositionTree } from '@/components/DispositionTree';
import { Loader2 } from 'lucide-react';

export default function SharedDispositionTreePage() {
  const params = useParams();
  const shareId = params?.shareId as string;
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Small delay to ensure component is mounted
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)] mx-auto mb-4" />
          <p className="text-[var(--secondary)]">Loading shared canvas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] p-4">
      <div className="max-w-full h-screen">
        <DispositionTree readOnly={true} shareId={shareId} />
      </div>
    </div>
  );
}


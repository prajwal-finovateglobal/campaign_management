/**
 * Google Chat Notification Service
 * Sends campaign lifecycle notifications to Google Chat webhook
 * 
 * Note: Next.js automatically loads .env.local at build/startup time.
 * No need for dotenv package in frontend. Variables with NEXT_PUBLIC_ 
 * prefix are available in browser.
 */

import { formatIST, formatDuration } from './timeUtils';

// Load webhook URL from environment (loaded automatically by Next.js)
const WEBHOOK_URL = process.env.NEXT_PUBLIC_WEBHOOK_URL || '';

// Log initialization status (only in development)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('🔔 Google Chat Notifications:', WEBHOOK_URL ? '✅ Enabled' : '❌ Disabled (NEXT_PUBLIC_WEBHOOK_URL not set)');
  if (WEBHOOK_URL) {
    console.log('📡 Webhook URL loaded:', WEBHOOK_URL.substring(0, 50) + '...');
  }
}

interface NotificationParams {
  title: string;
  campaign_name?: string;
  campaign_id?: number;
  status?: string;
  chunks?: number;
  chunk_size?: number;
  chunks_left?: number;
  total_records?: number;
  time_consumed?: string;
  total_time?: string;
  time_taken?: string;
  operation?: string;
  error?: string;
  failed_chunks?: string[];
  timestamp: string;
  action_required?: string;
}

/**
 * Send notification to Google Chat
 * @param params Notification parameters
 * @returns Promise<boolean> Success status
 */
export async function sendGoogleChatNotification(params: NotificationParams): Promise<boolean> {
  if (!WEBHOOK_URL) {
    console.warn('Google Chat webhook not configured. Set NEXT_PUBLIC_WEBHOOK_URL in .env.local');
    return false;
  }

  try {
    // Build message based on notification type
    let message = `${params.title}\n\n`;
    
    if (params.campaign_name) {
      message += `Campaign: ${params.campaign_name}\n`;
    }
    
    if (params.status) {
      message += `Status: ${params.status}\n`;
    }
    
    if (params.chunks !== undefined) {
      message += `Chunks: ${params.chunks} chunks\n`;
    }
    
    if (params.chunk_size !== undefined) {
      message += `Chunk Size: ${params.chunk_size} records/chunk\n`;
    }
    
    if (params.chunks_left !== undefined) {
      message += `Chunks Left: ${params.chunks_left} chunks still running\n`;
    }
    
    if (params.total_records !== undefined) {
      message += `Records: ${params.total_records.toLocaleString()} records uploaded\n`;
    }
    
    if (params.time_consumed) {
      message += `Time Consumed: ${params.time_consumed}\n`;
    }
    
    if (params.total_time) {
      message += `Total Time: ${params.total_time}\n`;
    }
    
    if (params.time_taken) {
      message += `Time Taken: ${params.time_taken}\n`;
    }
    
    if (params.operation) {
      message += `Operation: ${params.operation}\n`;
    }
    
    if (params.error) {
      message += `Error: ${params.error}\n`;
    }
    
    if (params.failed_chunks && params.failed_chunks.length > 0) {
      message += `Failed Chunks: ${params.failed_chunks.join(', ')}\n`;
    }
    
    // Add timestamp
    if (params.title.includes('Started')) {
      message += `Started: ${params.timestamp}`;
    } else if (params.title.includes('Paused')) {
      message += `Paused: ${params.timestamp}`;
    } else if (params.title.includes('Completed')) {
      message += `Completed: ${params.timestamp}`;
    } else if (params.title.includes('Deleted')) {
      message += `Deleted: ${params.timestamp}`;
    } else if (params.title.includes('Error')) {
      message += `Time: ${params.timestamp}`;
    } else {
      message += `${params.timestamp}`;
    }
    
    if (params.action_required) {
      message += `\n\n${params.action_required}`;
    }

    // Send to Google Chat
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        text: message
      }),
    });

    if (!response.ok) {
      console.error('Failed to send Google Chat notification:', response.statusText);
      return false;
    }

    console.log('✅ Google Chat notification sent:', params.title);
    return true;

  } catch (error) {
    console.error('Error sending Google Chat notification:', error);
    return false;
  }
}

/**
 * Notify campaign started
 */
export async function notifyCampaignStarted(params: {
  campaign_name: string;
  campaign_id: number;
  chunks: number;
  chunk_size: number;
  started_at: number;
}) {
  return sendGoogleChatNotification({
    title: '▶️ Campaign Started',
    campaign_name: params.campaign_name,
    status: 'Running',
    chunks: params.chunks,
    chunk_size: params.chunk_size,
    timestamp: formatIST(params.started_at),
  });
}

/**
 * Notify campaign paused
 */
export async function notifyCampaignPaused(params: {
  campaign_name: string;
  campaign_id: number;
  chunks_left: number;
  started_at: number;
  paused_at: number;
}) {
  return sendGoogleChatNotification({
    title: '⏸️ Campaign Paused',
    campaign_name: params.campaign_name,
    status: 'Paused',
    chunks_left: params.chunks_left,
    time_consumed: formatDuration(params.started_at, params.paused_at),
    timestamp: formatIST(params.paused_at),
  });
}

/**
 * Notify campaign upserting started
 */
export async function notifyCampaignUpserting(params: {
  campaign_name: string;
  campaign_id: number;
  chunks: number;
  upsert_started_at: number;
}) {
  return sendGoogleChatNotification({
    title: '📤 Campaign Upserting',
    campaign_name: params.campaign_name,
    status: 'Uploading records to Millis.ai',
    chunks: params.chunks,
    timestamp: formatIST(params.upsert_started_at),
  });
}

/**
 * Notify campaign ready (upsert complete)
 */
export async function notifyCampaignReady(params: {
  campaign_name: string;
  campaign_id: number;
  chunks: number;
  total_records: number;
  upsert_started_at: number;
  ready_at: number;
}) {
  return sendGoogleChatNotification({
    title: '✅ Campaign Ready',
    campaign_name: params.campaign_name,
    status: 'Ready to start',
    chunks: params.chunks,
    total_records: params.total_records,
    time_taken: formatDuration(params.upsert_started_at, params.ready_at),
    timestamp: formatIST(params.ready_at),
  });
}

/**
 * Notify campaign error
 */
export async function notifyCampaignError(params: {
  campaign_name: string;
  campaign_id: number;
  operation: string;
  error: string;
  failed_chunks?: string[];
  error_at: number;
  action_required?: string;
}) {
  return sendGoogleChatNotification({
    title: '❌ Campaign Error',
    campaign_name: params.campaign_name,
    operation: params.operation,
    error: params.error,
    failed_chunks: params.failed_chunks,
    timestamp: formatIST(params.error_at),
    action_required: params.action_required,
  });
}

'use client';

import { useEffect, useState } from 'react';

/**
 * Environment Variable Test Page
 * Verifies that NEXT_PUBLIC_WEBHOOK_URL is loaded correctly
 * Similar to backend's load_dotenv() verification
 */
export default function TestEnvPage() {
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<string>('');

  useEffect(() => {
    // Check if NEXT_PUBLIC_WEBHOOK_URL is loaded
    const url = process.env.NEXT_PUBLIC_WEBHOOK_URL || '';
    setWebhookUrl(url);
    setIsLoaded(!!url);
  }, []);

  const testWebhook = async () => {
    if (!webhookUrl) {
      setTestResult('❌ NEXT_PUBLIC_WEBHOOK_URL not loaded. Did you restart the dev server?');
      return;
    }

    setTestResult('📤 Sending test message...');

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          text: '✅ Test message from Campaign Management Frontend (Next.js)!'
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setTestResult('✅ SUCCESS! Check your Google Chat space!');
        console.log('Success:', data);
      } else {
        setTestResult(`❌ Failed: ${response.status} - ${JSON.stringify(data)}`);
      }
    } catch (error: any) {
      setTestResult(`❌ Error: ${error.message}`);
      console.error('Error:', error);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>🔍 Environment Variable Test</h1>
      <p>This page verifies that Next.js loaded the .env.local file correctly</p>
      
      <div style={{ 
        padding: '15px', 
        margin: '20px 0', 
        border: '2px solid #ccc', 
        borderRadius: '5px',
        backgroundColor: isLoaded ? '#d4edda' : '#f8d7da'
      }}>
        <h2>NEXT_PUBLIC_WEBHOOK_URL Status:</h2>
        <p><strong>Loaded:</strong> {isLoaded ? '✅ YES' : '❌ NO'}</p>
        {isLoaded && (
          <p><strong>URL Preview:</strong> {webhookUrl.substring(0, 60)}...</p>
        )}
        {!isLoaded && (
          <div style={{ color: 'red', marginTop: '10px' }}>
            <p><strong>⚠️ NOT LOADED!</strong></p>
            <p>Steps to fix:</p>
            <ol>
              <li>Verify NEXT_PUBLIC_WEBHOOK_URL is in .env.local</li>
              <li>Stop the dev server (Ctrl+C)</li>
              <li>Restart: <code>npm run dev</code></li>
              <li>Refresh this page</li>
            </ol>
          </div>
        )}
      </div>

      {isLoaded && (
        <>
          <button 
            onClick={testWebhook}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Send Test Message to Google Chat
          </button>

          {testResult && (
            <div style={{ 
              marginTop: '20px', 
              padding: '15px', 
              border: '2px solid #007bff',
              borderRadius: '5px',
              backgroundColor: '#e7f3ff'
            }}>
              <h3>Test Result:</h3>
              <p>{testResult}</p>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: '30px', fontSize: '12px', color: '#666' }}>
        <h3>📝 Notes:</h3>
        <ul>
          <li><strong>Backend:</strong> Uses <code>load_dotenv()</code> to load .env</li>
          <li><strong>Frontend (Next.js):</strong> Automatically loads .env.local at startup</li>
          <li>Variables must start with <code>NEXT_PUBLIC_</code> to be available in browser</li>
          <li>Changes to .env.local require server restart</li>
        </ul>
      </div>
    </div>
  );
}

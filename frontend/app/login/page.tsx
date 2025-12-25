'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { api, setAuthToken } from '@/lib/api';
import { Loader2, Lock, User, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [mounted, setMounted] = useState(false);

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
      setTheme(initialTheme);
      document.documentElement.setAttribute('data-theme', initialTheme);
      setMounted(true);
    }
  }, []);

  // Update theme when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
    }
  }, [theme]);

  // Check if already logged in
  useEffect(() => {
    // Use getAuthToken which checks both cookies and localStorage
    const token = typeof window !== 'undefined' ? 
      (document.cookie.split(';').find(c => c.trim().startsWith('auth_token='))?.split('=')[1] ||
       localStorage.getItem('auth_token')) : null;
    
    if (token) {
      // Verify token is still valid (api.get will automatically add Authorization header)
      api.get('/auth/verify').then(response => {
        if (response.ok) {
          router.push('/');
        } else {
          // Token invalid, clear it
          setAuthToken(null);
        }
      }).catch(() => {
        // Token invalid, clear it
        setAuthToken(null);
      });
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await api.post('/auth/login', {
        username,
        password,
      });

      const data = await response.json();

      if (data.success && data.token) {
        setAuthToken(data.token);
        router.push('/');
      } else {
        setError(data.message || 'Invalid username or password');
      }
    } catch (err: any) {
      setError('Network error. Please check if the backend is running.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) {
    return null; // Prevent flash of unstyled content
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Matrix Grid Background */}
      <div className="absolute inset-0 matrix-grid"></div>
      
      {/* Glowing Lines Animation */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none glow-lines-container">
        <div className="glow-line line-1"></div>
        <div className="glow-line line-2"></div>
        <div className="glow-line line-3"></div>
        <div className="glow-line line-4"></div>
        <div className="glow-line line-5"></div>
        <div className="glow-line line-6"></div>
      </div>
      
      <div className="w-full max-w-md relative z-10">
        {/* Logo and Title with animation */}
        <div className="text-center mb-8 animate-fade-in-down">
          <div className="inline-flex items-center justify-center mb-4 animate-scale-in">
            <Image 
              src="/logo.png" 
              alt="Finovate Global Logo" 
              width={80} 
              height={80} 
              className="object-contain logo-glow"
            />
          </div>
          <h1 className="text-4xl font-bold text-[var(--foreground)] mb-2">
            Finovate Global
          </h1>
          <p className="text-xl text-[var(--secondary)] font-medium">
            Campaigns
          </p>
          <p className="text-sm text-[var(--secondary)] mt-2">
            Sign in to access your campaign management dashboard
          </p>
        </div>

        {/* Login Card with slide-up animation */}
        <div className="bg-[var(--card-bg)] rounded-2xl shadow-xl p-8 border border-[var(--card-border)] animate-slide-up login-box-glow">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm animate-fade-in">
                {error}
              </div>
            )}

            {/* Username Field */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-[var(--foreground)] mb-2">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-[var(--secondary)]" />
                </div>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="block w-full pl-10 pr-3 py-3 border border-[var(--input-border)] rounded-lg focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] outline-none transition-colors text-[var(--foreground)] bg-[var(--input-bg)] placeholder:text-[var(--secondary)]"
                  placeholder="Enter your username"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[var(--foreground)] mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-[var(--secondary)]" />
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="block w-full pl-10 pr-10 py-3 border border-[var(--input-border)] rounded-lg focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] outline-none transition-colors text-[var(--foreground)] bg-[var(--input-bg)] placeholder:text-[var(--secondary)]"
                  placeholder="Enter your password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--secondary)] hover:text-[var(--foreground)] transition-colors"
                  tabIndex={-1}
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--primary)] text-white py-3 px-4 rounded-lg font-semibold hover:bg-[var(--primary-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 focus:ring-offset-[var(--card-bg)] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

      
      </div>
    </div>
  );
}


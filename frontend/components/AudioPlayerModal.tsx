'use client';

import { X, Play, Pause, Volume2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface AudioPlayerModalProps {
  url: string;
  onClose: () => void;
}

export function AudioPlayerModal({ url, onClose }: AudioPlayerModalProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newVolume = parseFloat(e.target.value);
    audio.volume = newVolume;
    setVolume(newVolume);
  };

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-[var(--card-bg)] rounded-lg shadow-xl w-full max-w-2xl mx-4 border border-[var(--card-border)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--card-border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Volume2 className="w-5 h-5" />
            Audio Player
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-[var(--table-row-hover)] transition-colors"
          >
            <X className="w-5 h-5 text-[var(--foreground)]" />
          </button>
        </div>

        {/* Audio Player */}
        <div className="p-6">
          <audio ref={audioRef} src={url} preload="metadata" />

          {/* Play/Pause Button */}
          <div className="flex items-center justify-center mb-6">
            <button
              onClick={togglePlay}
              className="w-16 h-16 rounded-full bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors flex items-center justify-center shadow-lg"
            >
              {isPlaying ? (
                <Pause className="w-8 h-8" />
              ) : (
                <Play className="w-8 h-8 ml-1" />
              )}
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm text-[var(--secondary)] mb-2">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-2 bg-[var(--input-border)] rounded-lg appearance-none cursor-pointer accent-[var(--primary)]"
              style={{
                background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${
                  (currentTime / duration) * 100
                }%, var(--input-border) ${
                  (currentTime / duration) * 100
                }%, var(--input-border) 100%)`,
              }}
            />
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-3">
            <Volume2 className="w-5 h-5 text-[var(--secondary)]" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              className="flex-1 h-2 bg-[var(--input-border)] rounded-lg appearance-none cursor-pointer accent-[var(--primary)]"
            />
            <span className="text-sm text-[var(--secondary)] w-12 text-right">
              {Math.round(volume * 100)}%
            </span>
          </div>

          {/* Audio URL Info */}
          <div className="mt-6 p-3 bg-[var(--table-header-bg)] rounded-md">
            <p className="text-xs text-[var(--secondary)] break-all">{url}</p>
          </div>
        </div>
      </div>
    </div>
  );
}


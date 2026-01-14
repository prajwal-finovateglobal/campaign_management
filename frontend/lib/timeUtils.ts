/**
 * Time Utility Functions for IST Timezone
 * Handles timestamp formatting and duration calculations
 */

const TIMEZONE = 'Asia/Kolkata';

/**
 * Format timestamp to IST string
 * @param timestamp - Unix timestamp in milliseconds or Date object
 * @returns Formatted string: "14-Jan-2026 03:30:45 PM IST"
 */
export function formatIST(timestamp: number | Date): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  
  // Format: dd-MMM-yyyy hh:mm:ss AM/PM IST
  const options: Intl.DateTimeFormatOptions = {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  };
  
  const formatted = new Intl.DateTimeFormat('en-IN', options).format(date);
  
  // Convert to desired format: "14-Jan-2026 03:30:45 PM IST"
  // The Intl.DateTimeFormat gives us something like: "14 Jan 2026, 03:30:45 pm"
  // We need to clean it up
  const parts = formatted.split(', ');
  const datePart = parts[0].replace(/ /g, '-');
  const timePart = parts[1].toUpperCase();
  
  return `${datePart} ${timePart} IST`;
}

/**
 * Calculate duration between two timestamps
 * @param startMs - Start timestamp in milliseconds
 * @param endMs - End timestamp in milliseconds
 * @returns Formatted duration: "2h 15m 30s" or "10m 30s" or "45s"
 */
export function formatDuration(startMs: number, endMs: number): string {
  const diffMs = endMs - startMs;
  const totalSeconds = Math.floor(diffMs / 1000);
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Get current IST timestamp
 * @returns Current timestamp in milliseconds
 */
export function nowIST(): number {
  return Date.now();
}

/**
 * Format current time to IST string
 * @returns Current time formatted as IST string
 */
export function currentIST(): string {
  return formatIST(nowIST());
}

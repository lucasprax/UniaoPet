/**
 * Safe, robust date and time utilities for UniãoPet.
 * Prevents RangeError / Invalid Date crashes on mobile browsers and WebViews.
 */

export function formatRelativeTime(dateOrIso?: string | number | null, fallback = 'Recentemente'): string {
  if (!dateOrIso) return fallback;

  // If already a non-ISO formatted string (and not 'Agora')
  if (typeof dateOrIso === 'string') {
    const trimmed = dateOrIso.trim();
    if (trimmed === 'Agora' || trimmed === 'Agora mesmo' || trimmed === 'Ágora') {
      return 'Agora mesmo';
    }
  }

  let timestamp: number;
  if (typeof dateOrIso === 'number') {
    timestamp = dateOrIso;
  } else {
    // Try to parse ISO or standard date string
    const parsed = Date.parse(dateOrIso);
    if (isNaN(parsed)) {
      // If unparseable string, return it if clean, else fallback
      return dateOrIso.length < 20 ? dateOrIso : fallback;
    }
    timestamp = parsed;
  }

  const now = Date.now();
  const diffMs = now - timestamp;

  // Future timestamp or less than 60 seconds
  if (diffMs < 60 * 1000) {
    return 'Agora mesmo';
  }

  const diffMin = Math.floor(diffMs / (60 * 1000));
  if (diffMin < 60) {
    return diffMin === 1 ? 'Há 1 minuto' : `Há ${diffMin} min`;
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return diffHours === 1 ? 'Há 1 hora' : `Há ${diffHours} horas`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return 'Ontem';
  }
  if (diffDays < 7) {
    return `Há ${diffDays} dias`;
  }
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? 'Há 1 semana' : `Há ${weeks} semanas`;
  }

  try {
    const d = new Date(timestamp);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  } catch {
    return fallback;
  }
}

export function formatDateSafely(dateStr?: string | null): string {
  if (!dateStr || typeof dateStr !== 'string') return '-';
  const clean = dateStr.trim();
  if (!clean) return '-';

  // Already dd/mm/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
    return clean;
  }

  // yyyy-mm-dd
  const isoParts = clean.split('T')[0].split('-');
  if (isoParts.length === 3) {
    const [y, m, d] = isoParts;
    if (y.length === 4 && m.length <= 2 && d.length <= 2) {
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
  }

  try {
    const parsed = new Date(clean);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('pt-BR');
    }
  } catch {
    // ignore
  }

  return clean;
}

export function isUserOnline(lastSeen?: number | string | null): boolean {
  if (!lastSeen) return false;
  const time = typeof lastSeen === 'number' ? lastSeen : Date.parse(lastSeen);
  if (isNaN(time)) return false;
  // Active in the last 4 minutes
  return Date.now() - time < 4 * 60 * 1000;
}

export function formatUserPresence(lastSeen?: number | string | null): { isOnline: boolean; text: string } {
  if (!lastSeen) {
    return { isOnline: false, text: 'Disponível por mensagem' };
  }

  const time = typeof lastSeen === 'number' ? lastSeen : Date.parse(lastSeen);
  if (isNaN(time)) {
    return { isOnline: false, text: 'Disponível por mensagem' };
  }

  const diffMs = Date.now() - time;
  if (diffMs < 4 * 60 * 1000) {
    return { isOnline: true, text: 'Online' };
  }

  if (diffMs < 60 * 60 * 1000) {
    const mins = Math.floor(diffMs / (60 * 1000));
    return { isOnline: false, text: `Visto há ${mins} min` };
  }

  const date = new Date(time);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    return { isOnline: false, text: `Visto hoje às ${hours}:${mins}` };
  }

  return { isOnline: false, text: 'Disponível por mensagem' };
}

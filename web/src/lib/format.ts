const dateTimeFormatter = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const escapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => escapeMap[char]);
}

function parseProviderDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatUnitDate(value: string | null): string {
  const date = parseProviderDate(value);

  return date ? dateTimeFormatter.format(date) : 'Sin dato';
}

export function formatIsoTime(value: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? '—' : timeFormatter.format(date);
}

export function formatRelativeTime(value: string | null): string {
  if (!value) {
    return 'sin datos';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'sin datos';
  }

  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));

  if (seconds < 10) {
    return 'hace unos segundos';
  }

  if (seconds < 60) {
    return `hace ${seconds} s`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `hace ${minutes} min`;
  }

  if (minutes < 1_440) {
    return `hace ${Math.floor(minutes / 60)} h`;
  }

  return dateTimeFormatter.format(date);
}

export function formatNumber(value: number | null, fractionDigits = 1): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }

  return new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

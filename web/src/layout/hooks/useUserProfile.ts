import { useCallback, useEffect, useState } from 'react';
import type { UserProfile } from '../types/user-profile.types';

const STORAGE_KEY = 'gp_user_profile';
const SESSION_START_KEY = 'gp_session_start_time';

function getOrInitSessionStart(): number {
  try {
    const existing = sessionStorage.getItem(SESSION_START_KEY);
    if (existing) {
      const parsed = Number(existing);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
    const now = Date.now();
    sessionStorage.setItem(SESSION_START_KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

function loadStoredProfile(sessionStartTime: number): UserProfile {
  const defaultProfile: UserProfile = {
    name: 'Administrador',
    role: 'Coordinador de Distribución',
    email: 'distribucion@gruppecuario.pe',
    phone: '+51 984 123 456',
    telegramUser: '@admin_gp',
    avatarUrl: '',
    sessionStart: new Date(sessionStartTime).toISOString(),
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProfile;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return {
      ...defaultProfile,
      ...parsed,
      sessionStart: new Date(sessionStartTime).toISOString(),
    };
  } catch {
    return defaultProfile;
  }
}

export function formatConnectionDuration(startTimeMs: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - startTimeMs) / 1000));
  const diffMinutes = Math.floor(diffSec / 60);

  if (diffMinutes < 1) return 'Hace un momento';
  if (diffMinutes < 60) return `${diffMinutes} min`;

  const hours = Math.floor(diffMinutes / 60);
  const remainingMin = diffMinutes % 60;
  return remainingMin > 0 ? `${hours}h ${remainingMin}m` : `${hours}h`;
}

export function useUserProfile() {
  const [sessionStartTime] = useState<number>(() => getOrInitSessionStart());
  const [profile, setProfile] = useState<UserProfile>(() =>
    loadStoredProfile(sessionStartTime),
  );
  const [connectionTime, setConnectionTime] = useState<string>(() =>
    formatConnectionDuration(sessionStartTime),
  );

  // Live timer for connection time
  useEffect(() => {
    const update = () => {
      setConnectionTime(formatConnectionDuration(sessionStartTime));
    };
    update();
    const interval = window.setInterval(update, 30_000);
    return () => window.clearInterval(interval);
  }, [sessionStartTime]);

  const saveProfile = useCallback((updated: Partial<UserProfile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...updated };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (err) {
        console.error('No se pudo guardar el perfil de usuario:', err);
      }
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(SESSION_START_KEY);
      sessionStorage.setItem(SESSION_START_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    // Opcional: recargar página o reiniciar sesión limpia
    window.location.reload();
  }, []);

  return {
    profile,
    connectionTime,
    sessionStartTime,
    saveProfile,
    logout,
  };
}


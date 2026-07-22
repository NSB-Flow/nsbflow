import { useEffect, useState, useCallback } from "react";

export interface AlertPrefs {
  enabled: boolean;
  emailEnabled: boolean; // envio dos mesmos alertas por e-mail
  warnPct: number;      // %: aviso amarelo
  criticalPct: number;  // %: aviso crítico
  trialWarnDays: number; // dias antes do trial expirar
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  enabled: true,
  emailEnabled: false,
  warnPct: 20,
  criticalPct: 10,
  trialWarnDays: 2,
};

const keyFor = (userId: string | null | undefined) =>
  `nsb:alert-prefs:${userId ?? "anon"}`;

function read(userId: string | null | undefined): AlertPrefs {
  if (typeof window === "undefined") return DEFAULT_ALERT_PREFS;
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return DEFAULT_ALERT_PREFS;
    const parsed = JSON.parse(raw) as Partial<AlertPrefs>;
    return { ...DEFAULT_ALERT_PREFS, ...parsed };
  } catch {
    return DEFAULT_ALERT_PREFS;
  }
}

export function useAlertPrefs(userId: string | null | undefined) {
  const [prefs, setPrefs] = useState<AlertPrefs>(DEFAULT_ALERT_PREFS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPrefs(read(userId));
    setHydrated(true);
  }, [userId]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === keyFor(userId)) setPrefs(read(userId));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId]);

  const update = useCallback(
    (patch: Partial<AlertPrefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        try {
          window.localStorage.setItem(keyFor(userId), JSON.stringify(next));
        } catch {
          /* noop */
        }
        return next;
      });
    },
    [userId],
  );

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(keyFor(userId));
    } catch {
      /* noop */
    }
    setPrefs(DEFAULT_ALERT_PREFS);
  }, [userId]);

  return { prefs, update, reset, hydrated };
}

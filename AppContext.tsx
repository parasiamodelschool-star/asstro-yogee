import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { calculateReport } from './numerology';
import { NumerologyReport } from './types';

const REPORTS_KEY = '@asstro_yogee/reports_v1';
const ACTIVE_KEY = '@asstro_yogee/active_report_v1';

interface AppContextValue {
  savedReports: NumerologyReport[];
  activeReport: NumerologyReport | null;
  hydrated: boolean;
  storageError: string | null;
  createAnalysis: (name: string, dob: string) => NumerologyReport;
  setActiveReport: (report: NumerologyReport | null) => void;
  saveReport: (report: NumerologyReport) => void;
  deleteReport: (id: string) => void;
  isSaved: (id: string) => boolean;
  getReport: (id: string) => NumerologyReport | undefined;
  toggleRemedyCheckin: (reportId: string, remedyId: string) => void;
  refreshStorage: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidReport(value: unknown): value is NumerologyReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<NumerologyReport>;
  return Boolean(
    typeof report.id === 'string' &&
    typeof report.dob === 'string' &&
    typeof report.mulank === 'number' &&
    typeof report.bhagyank === 'number' &&
    Array.isArray(report.grid) &&
    Array.isArray(report.factors) &&
    Array.isArray(report.remedyIds),
  );
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [savedReports, setSavedReports] = useState<NumerologyReport[]>([]);
  const [activeReport, setActiveReport] = useState<NumerologyReport | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const refreshStorage = useCallback(async () => {
    try {
      setStorageError(null);
      const [reportsRaw, activeRaw] = await Promise.all([
        AsyncStorage.getItem(REPORTS_KEY),
        AsyncStorage.getItem(ACTIVE_KEY),
      ]);
      const parsedReports: unknown = reportsRaw ? JSON.parse(reportsRaw) : [];
      const parsedActive: unknown = activeRaw ? JSON.parse(activeRaw) : null;
      setSavedReports(Array.isArray(parsedReports) ? parsedReports.filter(isValidReport) : []);
      setActiveReport(isValidReport(parsedActive) ? { ...parsedActive, remedyCheckins: parsedActive.remedyCheckins ?? {} } : null);
    } catch {
      setStorageError('सेव की गई जानकारी पढ़ने में समस्या हुई। पुनः प्रयास करें।');
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    void refreshStorage();
  }, [refreshStorage]);

  useEffect(() => {
    if (!hydrated) return;
    Promise.all([
      AsyncStorage.setItem(REPORTS_KEY, JSON.stringify(savedReports)),
      activeReport
        ? AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(activeReport))
        : AsyncStorage.removeItem(ACTIVE_KEY),
    ]).catch(() => setStorageError('डाइवाइस पर सेव नहीं हो पाया। स्थान जाँचकर पुनः प्रयास करें।'));
  }, [savedReports, activeReport, hydrated]);

  const createAnalysis = useCallback((name: string, dob: string) => {
    const report = calculateReport(name, dob);
    setActiveReport(report);
    return report;
  }, []);

  const saveReport = useCallback((report: NumerologyReport) => {
    const updated = { ...report, updatedAt: new Date().toISOString() };
    setActiveReport(updated);
    setSavedReports((previous) => [updated, ...previous.filter((item) => item.id !== updated.id)]);
  }, []);

  const deleteReport = useCallback((id: string) => {
    setSavedReports((previous) => previous.filter((report) => report.id !== id));
    setActiveReport((previous) => previous?.id === id ? null : previous);
  }, []);

  const isSaved = useCallback((id: string) => savedReports.some((report) => report.id === id), [savedReports]);
  const getReport = useCallback((id: string) => {
    if (activeReport?.id === id) return activeReport;
    return savedReports.find((report) => report.id === id);
  }, [activeReport, savedReports]);

  const toggleRemedyCheckin = useCallback((reportId: string, remedyId: string) => {
    const today = localDateKey();
    const toggle = (report: NumerologyReport): NumerologyReport => {
      const current = report.remedyCheckins?.[remedyId] ?? [];
      const dates = current.includes(today) ? current.filter((date) => date !== today) : [...current, today].sort();
      return {
        ...report,
        updatedAt: new Date().toISOString(),
        remedyCheckins: { ...(report.remedyCheckins ?? {}), [remedyId]: dates },
      };
    };
    setActiveReport((previous) => previous?.id === reportId ? toggle(previous) : previous);
    setSavedReports((previous) => previous.map((report) => report.id === reportId ? toggle(report) : report));
  }, []);

  const value = useMemo<AppContextValue>(() => ({
    savedReports,
    activeReport,
    hydrated,
    storageError,
    createAnalysis,
    setActiveReport,
    saveReport,
    deleteReport,
    isSaved,
    getReport,
    toggleRemedyCheckin,
    refreshStorage,
  }), [savedReports, activeReport, hydrated, storageError, createAnalysis, saveReport, deleteReport, isSaved, getReport, toggleRemedyCheckin, refreshStorage]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used within AppProvider');
  return value;
}

export { localDateKey };

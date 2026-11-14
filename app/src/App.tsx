import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { db } from './db/db';
import { FarmRepo } from './db/repo';
import { setLanguage } from './i18n';
import Journal from './screens/Journal';
import Settings from './screens/Settings';
import Setup from './screens/Setup';
import Today from './screens/Today';
import { ToastProvider } from './ui/components';
import { FarmProvider, type FarmData } from './ui/farm';

const notDeleted = <T extends { deletedAt?: number }>(rows: T[]) => rows.filter((r) => !r.deletedAt);

export default function App() {
  const { t } = useTranslation();
  const farmId = useLiveQuery(async () => (await db.meta.get('currentFarmId'))?.value ?? '', []);

  const data = useLiveQuery(async () => {
    if (!farmId) return null;
    const [farm, settings, fields, units, taskTypes, entries] = await Promise.all([
      db.farms.get(farmId),
      db.settings.get(farmId),
      db.fields.where('farmId').equals(farmId).toArray(),
      db.units.where('farmId').equals(farmId).toArray(),
      db.taskTypes.where('farmId').equals(farmId).toArray(),
      db.entries.where('farmId').equals(farmId).toArray(),
    ]);
    if (!farm || !settings) return null;
    return {
      farmName: farm.name,
      settings,
      fields: notDeleted(fields),
      units: notDeleted(units),
      taskTypes: notDeleted(taskTypes),
      entries: notDeleted(entries),
    };
  }, [farmId]);

  const repo = useMemo(() => (farmId ? new FarmRepo(farmId) : null), [farmId]);

  useEffect(() => {
    if (data?.settings.language) setLanguage(data.settings.language);
  }, [data?.settings.language]);

  if (farmId === undefined || (farmId && data === undefined)) {
    return <div className="splash">{t('common.loading')}</div>;
  }

  if (!farmId || !data || !repo || !data.settings.setupDone) {
    return <Setup />;
  }

  const value: FarmData = { repo, ...data };

  return (
    <FarmProvider value={value}>
      <ToastProvider>
        <div className="shell">
          <Routes>
            <Route path="/" element={<Today key="new" />} />
            <Route path="/entry/:id" element={<Today key="edit" />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/oil" element={<ComingSoon text={t('soon.oil')} />} />
            <Route path="/money" element={<ComingSoon text={t('soon.money')} />} />
            <Route path="/reports" element={<ComingSoon text={t('soon.reports')} />} />
            <Route path="/more" element={<More />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Today key="new" />} />
          </Routes>
          <BottomNav />
        </div>
      </ToastProvider>
    </FarmProvider>
  );
}

function BottomNav() {
  const { t } = useTranslation();
  const items = [
    { to: '/', icon: '✚', label: t('nav.today'), end: true },
    { to: '/journal', icon: '📅', label: t('nav.journal') },
    { to: '/oil', icon: '💧', label: t('nav.oil') },
    { to: '/money', icon: '€', label: t('nav.money') },
    { to: '/more', icon: '☰', label: t('nav.more') },
  ];
  return (
    <nav className="bottom-nav">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="nav-icon" aria-hidden>
            {i.icon}
          </span>
          <span>{i.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function ComingSoon({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <main className="page">
      <div className="empty">
        <h1>{t('soon.title')}</h1>
        <p className="muted">{text}</p>
      </div>
    </main>
  );
}

function More() {
  const { t } = useTranslation();
  return (
    <main className="page">
      <ul className="menu">
        <li>
          <Link to="/reports">📊 {t('more.reports')}</Link>
        </li>
        <li>
          <Link to="/settings">⚙️ {t('more.settings')}</Link>
        </li>
      </ul>
    </main>
  );
}

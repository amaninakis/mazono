import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { addDays, monthGrid, parseISODate, todayISO } from '../core/dates';
import { formatNumber } from '../core/format';
import type { TaskEntry, TaskType } from '../core/types';
import { useToast } from '../ui/components';
import { taskName, useFarm } from '../ui/farm';

export default function Journal() {
  const { t, i18n } = useTranslation();
  const { repo, entries, taskTypes, fields, units } = useFarm();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const loc = i18n.language;
  const today = todayISO();
  const date = params.get('date') ?? today;
  const [month, setMonth] = useState(() => date.slice(0, 7));

  const setDate = (d: string) => {
    setParams({ date: d }, { replace: true });
    setMonth(d.slice(0, 7));
  };

  const typeById = useMemo(() => new Map(taskTypes.map((x) => [x.id, x])), [taskTypes]);
  const byDay = useMemo(() => {
    const m = new Map<string, TaskEntry[]>();
    for (const e of entries) {
      if (e.deletedAt) continue;
      (m.get(e.date) ?? m.set(e.date, []).get(e.date)!).push(e);
    }
    return m;
  }, [entries]);

  const [y, mo] = month.split('-').map(Number);
  const grid = monthGrid(y, mo);
  const shiftMonth = (d: number) => {
    const dt = new Date(y, mo - 1 + d, 1);
    setMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  };
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(loc, { weekday: 'narrow' }).format(new Date(2024, 0, 1 + i)),
  );
  const monthTitle = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' }).format(new Date(y, mo - 1, 1));
  const dayTitle = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long' }).format(parseISODate(date));

  const dayEntries = (byDay.get(date) ?? []).sort((a, b) => a.updatedAt - b.updatedAt);

  const remove = async (e: TaskEntry) => {
    await repo.softDelete('entries', e.id);
    toast({ title: t('journal.deleted'), action: { label: t('common.undo'), run: () => void repo.restore('entries', e.id) } });
  };

  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? '?';
  const details = (e: TaskEntry) => {
    const parts: string[] = [];
    if (e.trees) parts.push(t('journal.trees', { count: e.trees }));
    for (const q of e.quantities ?? []) parts.push(`${formatNumber(q.amount, loc)} ${unitName(q.unitId)}`);
    if (e.amount) parts.push(`${e.product ? e.product + ' · ' : ''}${formatNumber(e.amount, loc)} ${e.amountUnit ?? ''}`);
    if (e.workers) parts.push(`${e.workers} × ${formatNumber(e.hours ?? 0, loc)} h`);
    if (e.fieldFinished) parts.push(t('journal.fieldFinished'));
    return parts.join(' · ');
  };

  return (
    <main className="page journal">
      <section className="card calendar">
        <div className="row-between">
          <button type="button" className="icon-btn" aria-label={t('journal.prevMonth')} onClick={() => shiftMonth(-1)}>
            ‹
          </button>
          <strong className="cap">{monthTitle}</strong>
          <button type="button" className="icon-btn" aria-label={t('journal.nextMonth')} onClick={() => shiftMonth(1)}>
            ›
          </button>
        </div>
        <div className="cal-grid">
          {weekdays.map((w, i) => (
            <span key={i} className="cal-wd">
              {w}
            </span>
          ))}
          {grid.map((d, i) =>
            d ? (
              <button
                key={d}
                type="button"
                className={`cal-day ${d === date ? 'selected' : ''} ${d === today ? 'today' : ''}`}
                onClick={() => setDate(d)}
                aria-label={d}
                aria-current={d === date ? 'date' : undefined}
              >
                <span>{Number(d.slice(8))}</span>
                <Dots types={distinctTypes(byDay.get(d), typeById)} />
              </button>
            ) : (
              <span key={`x${i}`} />
            ),
          )}
        </div>
      </section>

      <div className="day-nav">
        <button type="button" className="icon-btn" aria-label={t('journal.prevDay')} onClick={() => setDate(addDays(date, -1))}>
          ‹
        </button>
        <h1 className="cap">{dayTitle}</h1>
        <button type="button" className="icon-btn" aria-label={t('journal.nextDay')} onClick={() => setDate(addDays(date, 1))}>
          ›
        </button>
      </div>
      {date !== today && (
        <button type="button" className="btn ghost small center" onClick={() => setDate(today)}>
          {t('journal.goToday')}
        </button>
      )}

      {dayEntries.length === 0 ? (
        <div className="empty">
          <p className="muted">{t('journal.noEntries')}</p>
          <Link className="btn" to={`/?date=${date}`}>
            + {t('journal.logTask')}
          </Link>
        </div>
      ) : (
        <ul className="entries">
          {dayEntries.map((e) => {
            const tt = typeById.get(e.taskTypeId);
            return (
              <li key={e.id} className="entry" style={{ '--c': tt?.color ?? '#777' } as React.CSSProperties}>
                <button type="button" className="entry-main" onClick={() => navigate(`/entry/${e.id}`)}>
                  <span className="entry-icon" aria-hidden>
                    {tt?.icon}
                  </span>
                  <span className="entry-text">
                    <strong>
                      {tt ? taskName(t, tt) : '?'} · {fields.find((f) => f.id === e.fieldId)?.name ?? t('journal.unknownField')}
                    </strong>
                    <small>{details(e)}</small>
                    {e.notes && <small className="muted">{e.notes}</small>}
                  </span>
                </button>
                <button type="button" className="icon-btn" aria-label={t('common.delete')} onClick={() => remove(e)}>
                  🗑
                </button>
              </li>
            );
          })}
          <li>
            <Link className="btn ghost small" to={`/?date=${date}`}>
              + {t('journal.logTask')}
            </Link>
          </li>
        </ul>
      )}
    </main>
  );
}

function distinctTypes(list: TaskEntry[] | undefined, byId: Map<string, TaskType>): TaskType[] {
  if (!list) return [];
  const seen = new Map<string, TaskType>();
  for (const e of list) {
    const tt = byId.get(e.taskTypeId);
    if (tt) seen.set(tt.id, tt);
  }
  return [...seen.values()];
}

function Dots({ types }: { types: TaskType[] }) {
  if (!types.length) return <span className="dots" />;
  return (
    <span className="dots" aria-hidden>
      {types.slice(0, 3).map((x) => (
        <i key={x.id} style={{ background: x.color }} />
      ))}
      {types.length > 3 && <b>+</b>}
    </span>
  );
}

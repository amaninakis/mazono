import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TASK_COLORS, TASK_ICONS } from '../core/defaults';
import { parseDecimal } from '../core/progress';
import type { InputKind, Language } from '../core/types';
import { db } from '../db/db';
import { importFarm } from '../db/repo';
import { LANGUAGES, setLanguage } from '../i18n';
import { Toggle, useToast } from '../ui/components';
import { taskName, useFarm } from '../ui/farm';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { repo, settings, farmName, fields, units, taskTypes } = useFarm();
  const toast = useToast();
  const [showArchived, setShowArchived] = useState(false);
  const [newField, setNewField] = useState({ name: '', trees: '' });
  const [newUnit, setNewUnit] = useState('');
  const months = Array.from({ length: 12 }, (_, i) => ({
    n: i + 1,
    short: new Intl.DateTimeFormat(i18n.language, { month: 'short' }).format(new Date(2024, i, 1)),
    long: new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(new Date(2024, i, 1)),
  }));

  const visible = <T extends { archived: boolean }>(rows: T[]) => rows.filter((r) => showArchived || !r.archived);

  const changeLang = (l: Language) => {
    setLanguage(l);
    void repo.updateSettings({ language: l });
  };

  const addField = async () => {
    if (!newField.name.trim()) return;
    await repo.addField({
      name: newField.name.trim(),
      trees: Math.round(parseDecimal(newField.trees) ?? 0),
      archived: false,
      order: fields.length,
    });
    setNewField({ name: '', trees: '' });
  };

  const addUnit = async () => {
    if (!newUnit.trim()) return;
    await repo.addUnit({ name: newUnit.trim(), isDefault: units.length === 0, archived: false });
    setNewUnit('');
  };

  const addTaskType = async () => {
    const n = taskTypes.length;
    await repo.addTaskType({
      name: t('task.new'),
      inputKind: 'trees',
      color: TASK_COLORS[n % TASK_COLORS.length],
      icon: TASK_ICONS[(n + 4) % TASK_ICONS.length],
      activeMonths: [],
      archived: false,
      order: n,
    });
  };

  const exportData = async () => {
    const data = await repo.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `harvestlog-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (file: File) => {
    if (!window.confirm(t('settings.importConfirm'))) return;
    try {
      await importFarm(JSON.parse(await file.text()));
      toast({ title: t('settings.importDone') });
    } catch {
      toast({ title: t('settings.importFailed') });
    }
  };

  return (
    <main className="page settings">
      <header className="page-head">
        <h1>{t('settings.title')}</h1>
      </header>

      <section className="card">
        <h2>{t('settings.general')}</h2>
        <label className="label" htmlFor="s-farm">
          {t('settings.farmName')}
        </label>
        <input
          id="s-farm"
          className="input"
          defaultValue={farmName}
          onBlur={(e) => e.target.value.trim() && db.farms.update(repo.farmId, { name: e.target.value.trim() })}
        />
        <span className="label">{t('settings.language')}</span>
        <div className="chips">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              className={`chip ${settings.language === l.code ? 'selected' : ''}`}
              onClick={() => changeLang(l.code)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <span className="label">{t('settings.yieldFormat')}</span>
        <div className="chips">
          {(['ratio', 'percent'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`chip ${settings.yieldFormat === f ? 'selected' : ''}`}
              onClick={() => repo.updateSettings({ yieldFormat: f })}
            >
              {t(f === 'ratio' ? 'settings.yieldRatio' : 'settings.yieldPercent')}
            </button>
          ))}
        </div>
        <label className="label" htmlFor="s-season">
          {t('settings.seasonStart')}
        </label>
        <select
          id="s-season"
          className="input select"
          value={settings.seasonStartMonth}
          onChange={(e) => repo.updateSettings({ seasonStartMonth: Number(e.target.value) })}
        >
          {months.map((m) => (
            <option key={m.n} value={m.n}>
              {m.long}
            </option>
          ))}
        </select>
      </section>

      <section className="card">
        <h2>{t('settings.modules')}</h2>
        <Toggle
          checked={settings.labourEnabled}
          onChange={(v) => repo.updateSettings({ labourEnabled: v })}
          label={t('settings.labour')}
          help={t('settings.labourHelp')}
        />
      </section>

      <div className="row-end">
        <Toggle checked={showArchived} onChange={setShowArchived} label={t('settings.showArchived')} />
      </div>

      <section className="card" id="fields">
        <h2>{t('settings.fields')}</h2>
        <ul className="list">
          {visible(fields)
            .sort((a, b) => a.order - b.order)
            .map((f) => (
              <li key={f.id} className={`field-row ${f.archived ? 'off' : ''}`}>
                <input
                  className="input"
                  aria-label={t('common.name')}
                  defaultValue={f.name}
                  onBlur={(e) => e.target.value.trim() && repo.update('fields', f.id, { name: e.target.value.trim() })}
                />
                <input
                  className="input small"
                  inputMode="numeric"
                  aria-label={t('common.trees')}
                  defaultValue={f.trees || ''}
                  placeholder={t('common.trees')}
                  onBlur={(e) => repo.update('fields', f.id, { trees: Math.round(parseDecimal(e.target.value) ?? 0) })}
                />
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => repo.update('fields', f.id, { archived: !f.archived })}
                >
                  {f.archived ? t('common.unarchive') : t('common.archive')}
                </button>
              </li>
            ))}
          <li className="field-row">
            <input
              className="input"
              placeholder={t('setup.fieldName')}
              aria-label={t('setup.fieldName')}
              value={newField.name}
              onChange={(e) => setNewField({ ...newField, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && addField()}
            />
            <input
              className="input small"
              inputMode="numeric"
              placeholder={t('common.trees')}
              aria-label={t('common.trees')}
              value={newField.trees}
              onChange={(e) => setNewField({ ...newField, trees: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && addField()}
            />
            <button type="button" className="btn small" onClick={addField}>
              {t('common.add')}
            </button>
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>{t('settings.units')}</h2>
        <p className="muted small">{t('setup.unitsHelp')}</p>
        <ul className="list">
          {visible(units).map((u) => (
            <li key={u.id} className={`unit-row ${u.archived ? 'off' : ''}`}>
              <input
                className="input"
                aria-label={t('common.name')}
                defaultValue={u.name}
                onBlur={(e) => e.target.value.trim() && repo.update('units', u.id, { name: e.target.value.trim() })}
              />
              <input
                className="input small"
                inputMode="decimal"
                placeholder={t('setup.approxKg')}
                aria-label={t('setup.approxKg')}
                defaultValue={u.approxKg ?? ''}
                onBlur={(e) => repo.update('units', u.id, { approxKg: parseDecimal(e.target.value) ?? undefined })}
              />
              <label className="radio">
                <input type="radio" name="s-default-unit" checked={u.isDefault} onChange={() => repo.setDefaultUnit(u.id)} />
                <span>{t('setup.default')}</span>
              </label>
              <button
                type="button"
                className="btn ghost small"
                disabled={u.isDefault && !u.archived}
                onClick={() => repo.update('units', u.id, { archived: !u.archived })}
              >
                {u.archived ? t('common.unarchive') : t('common.archive')}
              </button>
            </li>
          ))}
        </ul>
        <div className="inline-add">
          <input
            className="input"
            placeholder={t('setup.unitName')}
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addUnit()}
          />
          <button type="button" className="btn small" onClick={addUnit}>
            {t('common.add')}
          </button>
        </div>
      </section>

      <section className="card">
        <h2>{t('settings.taskTypes')}</h2>
        <ul className="list task-types">
          {visible(taskTypes)
            .sort((a, b) => a.order - b.order)
            .map((x) => (
              <li key={x.id} className={`tt ${x.archived ? 'off' : ''}`} style={{ '--c': x.color } as React.CSSProperties}>
                <div className="tt-head">
                  <select
                    className="input select icon-select"
                    aria-label={t('settings.icon')}
                    value={x.icon}
                    onChange={(e) => repo.update('taskTypes', x.id, { icon: e.target.value })}
                  >
                    {[...new Set([x.icon, ...TASK_ICONS])].map((i) => (
                      <option key={i}>{i}</option>
                    ))}
                  </select>
                  <input
                    className="input"
                    aria-label={t('common.name')}
                    defaultValue={taskName(t, x)}
                    key={`${x.id}-${i18n.language}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== taskName(t, x)) repo.update('taskTypes', x.id, { name: v });
                    }}
                  />
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => repo.update('taskTypes', x.id, { archived: !x.archived })}
                  >
                    {x.archived ? t('common.unarchive') : t('common.archive')}
                  </button>
                </div>
                <div className="swatches" role="radiogroup" aria-label={t('settings.color')}>
                  {TASK_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={x.color === c}
                      aria-label={c}
                      className={`swatch ${x.color === c ? 'selected' : ''}`}
                      style={{ background: c }}
                      onClick={() => repo.update('taskTypes', x.id, { color: c })}
                    />
                  ))}
                </div>
                {!x.builtin && (
                  <select
                    className="input select"
                    value={x.inputKind}
                    onChange={(e) => repo.update('taskTypes', x.id, { inputKind: e.target.value as InputKind })}
                  >
                    {(['harvest', 'trees', 'quantity', 'done'] as InputKind[]).map((k) => (
                      <option key={k} value={k}>
                        {t(`inputKind.${k}`)}
                      </option>
                    ))}
                  </select>
                )}
                <span className="label small">{t('settings.activeMonths')}</span>
                <div className="months">
                  {months.map((m) => {
                    const on = x.activeMonths.includes(m.n);
                    return (
                      <button
                        key={m.n}
                        type="button"
                        aria-pressed={on}
                        className={`month ${on ? 'on' : ''}`}
                        onClick={() =>
                          repo.update('taskTypes', x.id, {
                            activeMonths: on ? x.activeMonths.filter((n) => n !== m.n) : [...x.activeMonths, m.n].sort((a, b) => a - b),
                          })
                        }
                      >
                        {m.short}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
        </ul>
        <button type="button" className="btn small" onClick={addTaskType}>
          + {t('settings.addTaskType')}
        </button>
      </section>

      <section className="card">
        <h2>{t('settings.data')}</h2>
        <p className="muted small">{t('settings.storageNote')}</p>
        <div className="actions wrap">
          <button type="button" className="btn" onClick={exportData}>
            {t('settings.export')}
          </button>
          <label className="btn ghost file-btn">
            {t('settings.import')}
            <input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
          </label>
        </div>
      </section>

      <p className="muted small center">{t('settings.version', { version: __APP_VERSION__ })}</p>
    </main>
  );
}

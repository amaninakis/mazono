import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UNIT_PRESETS } from '../core/defaults';
import { parseDecimal } from '../core/progress';
import type { Language } from '../core/types';
import { createFarm, importFarm } from '../db/repo';
import { LANGUAGES, setLanguage } from '../i18n';

interface UnitDraft {
  key: string;
  name: string;
  selected: boolean;
  approxKg: string;
}
interface FieldDraft {
  name: string;
  trees: string;
}

export default function Setup() {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(0);
  const [lang, setLang] = useState<Language>(i18n.language as Language);
  const [farmName, setFarmName] = useState('');
  const [units, setUnits] = useState<UnitDraft[]>(() =>
    UNIT_PRESETS.map((p, i) => ({ key: p.key, name: '', selected: i === 0, approxKg: '' })),
  );
  const [defaultKey, setDefaultKey] = useState('sack');
  const [customUnit, setCustomUnit] = useState('');
  const [fields, setFields] = useState<FieldDraft[]>([{ name: '', trees: '' }]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const unitLabel = (u: UnitDraft) => u.name || t(`unitPreset.${u.key}`);
  const selected = units.filter((u) => u.selected);

  const chooseLang = (l: Language) => {
    setLang(l);
    setLanguage(l);
  };

  const toggleUnit = (key: string) => {
    setUnits((us) => us.map((u) => (u.key === key ? { ...u, selected: !u.selected } : u)));
    setError('');
  };

  const addCustomUnit = () => {
    const name = customUnit.trim();
    if (!name) return;
    const key = `custom-${Date.now()}`;
    setUnits((us) => [...us, { key, name, selected: true, approxKg: '' }]);
    setCustomUnit('');
  };

  const nextFromUnits = () => {
    if (!selected.length) return setError(t('setup.unitsRequired'));
    if (!selected.some((u) => u.key === defaultKey)) setDefaultKey(selected[0].key);
    setStep(2);
  };

  const finish = async () => {
    setBusy(true);
    const repo = await createFarm(farmName.trim() || t('setup.farmNamePlaceholder'), lang);
    const def = selected.some((u) => u.key === defaultKey) ? defaultKey : selected[0].key;
    for (const u of selected) {
      await repo.addUnit({
        name: unitLabel(u),
        approxKg: parseDecimal(u.approxKg) ?? undefined,
        isDefault: u.key === def,
        archived: false,
      });
    }
    let order = 0;
    for (const f of fields) {
      if (!f.name.trim()) continue;
      await repo.addField({
        name: f.name.trim(),
        trees: Math.round(parseDecimal(f.trees) ?? 0),
        archived: false,
        order: order++,
      });
    }
    await repo.updateSettings({ setupDone: true });
  };

  const restore = async (file: File) => {
    try {
      await importFarm(JSON.parse(await file.text()));
    } catch {
      setError(t('settings.importFailed'));
    }
  };

  return (
    <main className="setup">
      <div className="setup-progress" aria-hidden>
        {[0, 1, 2].map((s) => (
          <span key={s} className={s <= step ? 'on' : ''} />
        ))}
      </div>

      {step === 0 && (
        <section>
          <h1>{t('setup.welcome')}</h1>
          <p className="tagline">{t('setup.tagline')}</p>
          <p className="muted">{t('setup.intro')}</p>
          <label className="label">{t('setup.language')}</label>
          <div className="chips">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                className={`chip ${lang === l.code ? 'selected' : ''}`}
                onClick={() => chooseLang(l.code)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <label className="label" htmlFor="farm-name">
            {t('setup.farmName')}
          </label>
          <input
            id="farm-name"
            className="input"
            value={farmName}
            placeholder={t('setup.farmNamePlaceholder')}
            onChange={(e) => setFarmName(e.target.value)}
          />
          <div className="actions">
            <label className="btn ghost file-btn">
              {t('setup.restore')}
              <input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
            </label>
            <button type="button" className="btn primary" onClick={() => setStep(1)}>
              {t('common.next')}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </section>
      )}

      {step === 1 && (
        <section>
          <h1>{t('setup.unitsTitle')}</h1>
          <p className="muted">{t('setup.unitsHelp')}</p>
          <ul className="list">
            {units.map((u) => (
              <li key={u.key} className={`unit-row ${u.selected ? '' : 'off'}`}>
                <label className="check">
                  <input type="checkbox" checked={u.selected} onChange={() => toggleUnit(u.key)} />
                  <span>{unitLabel(u)}</span>
                </label>
                {u.selected && (
                  <>
                    <input
                      className="input small"
                      inputMode="decimal"
                      placeholder={t('setup.approxKg')}
                      aria-label={`${unitLabel(u)} ${t('setup.approxKg')}`}
                      value={u.approxKg}
                      onChange={(e) =>
                        setUnits((us) => us.map((x) => (x.key === u.key ? { ...x, approxKg: e.target.value } : x)))
                      }
                    />
                    <label className="radio">
                      <input
                        type="radio"
                        name="default-unit"
                        checked={defaultKey === u.key}
                        onChange={() => setDefaultKey(u.key)}
                      />
                      <span>{t('setup.default')}</span>
                    </label>
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="inline-add">
            <input
              className="input"
              placeholder={t('setup.unitName')}
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustomUnit()}
            />
            <button type="button" className="btn" onClick={addCustomUnit}>
              {t('common.add')}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button type="button" className="btn ghost" onClick={() => setStep(0)}>
              {t('common.back')}
            </button>
            <button type="button" className="btn primary" onClick={nextFromUnits}>
              {t('common.next')}
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h1>{t('setup.fieldsTitle')}</h1>
          <p className="muted">{t('setup.fieldsHelp')}</p>
          <ul className="list">
            {fields.map((f, i) => (
              <li key={i} className="field-row">
                <input
                  className="input"
                  placeholder={t('setup.fieldName')}
                  aria-label={t('setup.fieldName')}
                  value={f.name}
                  onChange={(e) => setFields((fs) => fs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
                <input
                  className="input small"
                  inputMode="numeric"
                  placeholder={t('common.trees')}
                  aria-label={t('common.trees')}
                  value={f.trees}
                  onChange={(e) => setFields((fs) => fs.map((x, j) => (j === i ? { ...x, trees: e.target.value } : x)))}
                />
              </li>
            ))}
          </ul>
          <button type="button" className="btn" onClick={() => setFields((fs) => [...fs, { name: '', trees: '' }])}>
            + {t('setup.addField')}
          </button>
          <div className="actions">
            <button type="button" className="btn ghost" onClick={() => setStep(1)}>
              {t('common.back')}
            </button>
            <button type="button" className="btn primary" disabled={busy} onClick={finish}>
              {t('setup.finish')}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

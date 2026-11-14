import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { addDays, todayISO } from '../core/dates';
import { AMOUNT_UNITS, TASK_COLORS, TASK_ICONS } from '../core/defaults';
import { formatNumber } from '../core/format';
import {
  defaultFieldId,
  defaultTaskTypeId,
  fieldProgress,
  fieldSeasonHarvest,
  perTree,
  sortForPicker,
} from '../core/progress';
import type { InputKind, TaskEntry, UnitAmount } from '../core/types';
import { Modal, Stepper, Toggle, useToast } from '../ui/components';
import { taskName, useFarm } from '../ui/farm';

export default function Today() {
  const { t, i18n } = useTranslation();
  const farm = useFarm();
  const { repo, settings, fields, units, taskTypes, entries } = farm;
  const { id: editId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const loc = i18n.language;

  const editing = editId ? entries.find((e) => e.id === editId) : undefined;
  const today = todayISO();

  const activeTypes = useMemo(
    () => taskTypes.filter((x) => !x.archived).sort((a, b) => a.order - b.order),
    [taskTypes],
  );
  const activeUnits = units.filter((u) => !u.archived);
  const defaultUnit = activeUnits.find((u) => u.isDefault) ?? activeUnits[0];

  const [date, setDate] = useState(params.get('date') ?? today);
  const [typeId, setTypeId] = useState<string | undefined>();
  const [fieldId, setFieldId] = useState<string | undefined>();
  const [trees, setTrees] = useState<number | null>(null);
  const [quantities, setQuantities] = useState<UnitAmount[]>([]);
  const [product, setProduct] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [amountUnit, setAmountUnit] = useState('kg');
  const [finished, setFinished] = useState(false);
  const [notes, setNotes] = useState('');
  const [workers, setWorkers] = useState<number | null>(null);
  const [hours, setHours] = useState<number | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState('');
  const [newTask, setNewTask] = useState(false);
  const [newUnit, setNewUnit] = useState(false);
  const [initFor, setInitFor] = useState<string | null>(null);

  const type = activeTypes.find((x) => x.id === typeId) ?? taskTypes.find((x) => x.id === typeId);
  const kind: InputKind = type?.inputKind ?? 'harvest';

  const progress = useMemo(
    () => (type ? fieldProgress(fields, entries, type, date, settings.seasonStartMonth, editing?.id) : []),
    [fields, entries, type, date, settings.seasonStartMonth, editing?.id],
  );
  const current = progress.find((p) => p.field.id === fieldId);

  const emptyQuantities = (): UnitAmount[] => (defaultUnit ? [{ unitId: defaultUnit.id, amount: 0 }] : []);

  // Initialise once per new/edit target.
  useEffect(() => {
    const key = editId ?? 'new';
    if (initFor === key || !activeTypes.length) return;
    if (editId && !editing) return;
    if (editing) {
      setDate(editing.date);
      setTypeId(editing.taskTypeId);
      setFieldId(editing.fieldId);
      setTrees(editing.trees ?? null);
      setQuantities(editing.quantities?.length ? editing.quantities : emptyQuantities());
      setProduct(editing.product ?? '');
      setAmount(editing.amount ?? null);
      setAmountUnit(editing.amountUnit ?? 'kg');
      setFinished(editing.fieldFinished);
      setNotes(editing.notes ?? '');
      setWorkers(editing.workers ?? null);
      setHours(editing.hours ?? null);
      setShowMore(!!(editing.notes || editing.workers || editing.hours));
    } else {
      const d = params.get('date') ?? today;
      const tid = defaultTaskTypeId(activeTypes, entries, d);
      const tt = activeTypes.find((x) => x.id === tid);
      setDate(d);
      setTypeId(tid);
      setFieldId(tt ? defaultFieldId(fieldProgress(fields, entries, tt, d, settings.seasonStartMonth)) : undefined);
      setQuantities(emptyQuantities());
    }
    setInitFor(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, editing, activeTypes.length]);

  const chooseType = (id: string) => {
    setTypeId(id);
    setError('');
    const tt = activeTypes.find((x) => x.id === id);
    if (tt && !editing) setFieldId(defaultFieldId(fieldProgress(fields, entries, tt, date, settings.seasonStartMonth)));
  };

  const resetForNext = () => {
    setTrees(null);
    setQuantities(emptyQuantities());
    setAmount(null);
    setFinished(false);
    setNotes('');
    setWorkers(null);
    setHours(null);
  };

  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? '?';
  const fieldName = (id?: string) => fields.find((f) => f.id === id)?.name ?? '';

  const save = async () => {
    if (!type || !fieldId) return;
    const q = quantities.filter((x) => x.amount > 0);
    const hasData =
      kind === 'done' ||
      finished ||
      (kind === 'harvest' && ((trees ?? 0) > 0 || q.length > 0)) ||
      (kind === 'trees' && (trees ?? 0) > 0) ||
      (kind === 'quantity' && ((amount ?? 0) > 0 || (trees ?? 0) > 0));
    if (!hasData) return setError(t('today.nothingToSave'));

    const row: Omit<TaskEntry, 'id' | 'farmId' | 'updatedAt'> & { id?: string } = {
      id: editing?.id,
      date,
      fieldId,
      taskTypeId: type.id,
      trees: kind === 'done' ? undefined : (trees ?? undefined),
      quantities: kind === 'harvest' ? q : undefined,
      product: kind === 'quantity' ? product.trim() || undefined : undefined,
      amount: kind === 'quantity' ? (amount ?? undefined) : undefined,
      amountUnit: kind === 'quantity' ? amountUnit : undefined,
      fieldFinished: finished,
      notes: notes.trim() || undefined,
      workers: settings.labourEnabled ? (workers ?? undefined) : editing?.workers,
      hours: settings.labourEnabled ? (hours ?? undefined) : editing?.hours,
    };
    const saved = await repo.saveEntry(row);

    if (editing) {
      toast({ title: t('today.updated') });
      navigate(`/journal?date=${date}`);
      return;
    }

    toast({
      title: `${t('today.saved')} · ${taskName(t, type)} · ${fieldName(fieldId)}`,
      lines: summaryLines(saved),
      action: { label: t('common.undo'), run: () => void repo.softDelete('entries', saved.id) },
    });
    resetForNext();
    const after = fieldProgress(fields, [...entries, saved], type, date, settings.seasonStartMonth);
    setFieldId(defaultFieldId(after));
  };

  const summaryLines = (e: TaskEntry): string[] => {
    const lines: string[] = [];
    const f = fieldName(e.fieldId);
    if (kind === 'harvest' && e.trees) {
      const pt = perTree(e.quantities ?? [], e.trees);
      const today = Object.entries(pt)
        .map(([u, v]) => t('today.perTree', { value: formatNumber(v, loc), unit: unitName(u) }))
        .join(' · ');
      if (today) lines.push(today);
      const season = fieldSeasonHarvest([...entries, e], e.fieldId, e.taskTypeId, e.date, settings.seasonStartMonth);
      const avg = Object.entries(perTree(Object.entries(season.amounts).map(([unitId, amount]) => ({ unitId, amount })), season.trees))
        .map(([u, v]) => t('today.perTree', { value: formatNumber(v, loc), unit: unitName(u) }))
        .join(' · ');
      if (avg && avg !== today) lines.push(t('today.seasonAvg', { field: f, value: avg }));
    }
    if (kind === 'quantity' && e.amount && e.trees) {
      lines.push(t('today.perTree', { value: formatNumber(e.amount / e.trees, loc), unit: e.amountUnit }));
    }
    if (e.fieldFinished) lines.push(t('today.fieldClosed', { field: f }));
    return lines;
  };

  if (!activeTypes.length) return <main className="page">{t('common.loading')}</main>;

  const treesLabel =
    kind === 'harvest' ? t('today.treesHarvested') : kind === 'trees' ? t('today.treesPruned') : t('today.treesWorked');
  const leftAfter =
    current?.remaining != null ? Math.max(current.remaining - (trees ?? 0), 0) : null;
  const products = [...new Set(entries.filter((e) => e.product).map((e) => e.product!))];

  return (
    <main className="page today">
      <header className="page-head">
        <h1>{editing ? t('today.editTitle') : t('today.title')}</h1>
      </header>

      <div className="task-chips" role="tablist">
        {activeTypes.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={x.id === typeId}
            className={`task-chip ${x.id === typeId ? 'selected' : ''}`}
            style={{ '--c': x.color } as React.CSSProperties}
            onClick={() => chooseType(x.id)}
          >
            <span aria-hidden>{x.icon}</span> {taskName(t, x)}
          </button>
        ))}
        {!editing && (
          <button type="button" className="task-chip add" onClick={() => setNewTask(true)}>
            + {t('task.new')}
          </button>
        )}
      </div>

      <section className="card">
        <div className="row-between">
          <label className="label" htmlFor="date">
            {t('today.date')}
          </label>
          <div className="chips tight">
            <button type="button" className={`chip ${date === today ? 'selected' : ''}`} onClick={() => setDate(today)}>
              {t('today.today')}
            </button>
            <button
              type="button"
              className={`chip ${date === addDays(today, -1) ? 'selected' : ''}`}
              onClick={() => setDate(addDays(today, -1))}
            >
              {t('today.yesterday')}
            </button>
            <input id="date" type="date" className="input date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
        </div>
      </section>

      <section className="card">
        <span className="label">{t('today.field')}</span>
        {progress.length === 0 ? (
          <p className="muted">
            {t('today.noFields')} <Link to="/settings#fields">{t('today.addFields')}</Link>
          </p>
        ) : (
          <div className="field-chips">
            {sortForPicker(progress).map((p) => (
              <button
                key={p.field.id}
                type="button"
                className={`field-chip ${p.field.id === fieldId ? 'selected' : ''} ${p.finished ? 'done' : ''}`}
                onClick={() => setFieldId(p.field.id)}
                aria-pressed={p.field.id === fieldId}
              >
                <span className="fc-name">{p.field.name}</span>
                <span className="fc-meta">
                  {p.finished
                    ? t('today.finished')
                    : p.remaining != null
                      ? t('today.treesLeft', { left: p.remaining, total: p.field.trees })
                      : ' '}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {fieldId && kind !== 'done' && (
        <section className="card">
          <label className="label" htmlFor="trees">
            {treesLabel}
          </label>
          <Stepper id="trees" label={treesLabel} value={trees} onChange={setTrees} step={1} />
          {leftAfter != null && kind !== 'quantity' && (
            <p className="hint">{t('today.leftAfter', { left: leftAfter, field: current!.field.name })}</p>
          )}
        </section>
      )}

      {fieldId && kind === 'harvest' && (
        <section className="card">
          <span className="label">{t('today.collected')}</span>
          {quantities.map((q, i) => (
            <div className="qty-row" key={i}>
              <select
                className="input select"
                aria-label={t('today.collected')}
                value={q.unitId}
                onChange={(e) => {
                  if (e.target.value === '__new') return setNewUnit(true);
                  setQuantities((qs) => qs.map((x, j) => (j === i ? { ...x, unitId: e.target.value } : x)));
                }}
              >
                {activeUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
                <option value="__new">{t('today.newUnit')}</option>
              </select>
              <Stepper
                label={unitName(q.unitId)}
                value={q.amount}
                step={0.5}
                onChange={(v) => setQuantities((qs) => qs.map((x, j) => (j === i ? { ...x, amount: v ?? 0 } : x)))}
              />
              {quantities.length > 1 && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('common.delete')}
                  onClick={() => setQuantities((qs) => qs.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn ghost small"
            onClick={() => {
              const unused = activeUnits.find((u) => !quantities.some((q) => q.unitId === u.id));
              if (unused) setQuantities((qs) => [...qs, { unitId: unused.id, amount: 0 }]);
              else setNewUnit(true);
            }}
          >
            + {t('today.addUnitRow')}
          </button>
        </section>
      )}

      {fieldId && kind === 'quantity' && (
        <section className="card">
          <label className="label" htmlFor="product">
            {t('today.product')}
          </label>
          <input
            id="product"
            className="input"
            list="products"
            value={product}
            placeholder={t('today.productPlaceholder')}
            onChange={(e) => setProduct(e.target.value)}
          />
          <datalist id="products">
            {products.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <span className="label">{t('today.amount')}</span>
          <div className="qty-row">
            <Stepper label={t('today.amount')} value={amount} onChange={setAmount} step={1} />
            <select className="input select narrow" aria-label={t('today.amount')} value={amountUnit} onChange={(e) => setAmountUnit(e.target.value)}>
              {AMOUNT_UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
        </section>
      )}

      {fieldId && (
        <section className="card">
          <Toggle
            checked={finished}
            onChange={setFinished}
            label={t('today.fieldFinished')}
            help={kind === 'done' ? undefined : t('today.fieldFinishedHelp')}
          />
          {settings.labourEnabled && (
            <div className="two-col">
              <div>
                <span className="label">{t('today.workers')}</span>
                <Stepper label={t('today.workers')} value={workers} onChange={setWorkers} />
              </div>
              <div>
                <span className="label">{t('today.hours')}</span>
                <Stepper label={t('today.hours')} value={hours} onChange={setHours} step={0.5} />
              </div>
            </div>
          )}
          {showMore ? (
            <>
              <label className="label" htmlFor="notes">
                {t('today.notes')}
              </label>
              <textarea id="notes" className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </>
          ) : (
            <button type="button" className="btn ghost small" onClick={() => setShowMore(true)}>
              + {t('today.notes')}
            </button>
          )}
        </section>
      )}

      {error && <p className="error">{error}</p>}

      {fieldId && (
        <div className="save-bar">
          {editing && (
            <button type="button" className="btn ghost" onClick={() => navigate(-1)}>
              {t('common.cancel')}
            </button>
          )}
          <button type="button" className="btn primary big" onClick={save}>
            {t('common.save')}
          </button>
        </div>
      )}

      {newTask && <NewTaskModal onClose={() => setNewTask(false)} onCreated={chooseType} />}
      {newUnit && (
        <NewUnitModal
          onClose={() => setNewUnit(false)}
          onCreated={(id) => setQuantities((qs) => [...qs, { unitId: id, amount: 0 }])}
        />
      )}
    </main>
  );
}

function NewTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useTranslation();
  const { repo, taskTypes } = useFarm();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<InputKind>('trees');
  const create = async () => {
    if (!name.trim()) return;
    const n = taskTypes.length;
    const row = await repo.addTaskType({
      name: name.trim(),
      inputKind: kind,
      color: TASK_COLORS[n % TASK_COLORS.length],
      icon: TASK_ICONS[(n + 4) % TASK_ICONS.length],
      activeMonths: [],
      archived: false,
      order: n,
    });
    onCreated(row.id);
    onClose();
  };
  return (
    <Modal title={t('today.newTaskTitle')} onClose={onClose}>
      <label className="label" htmlFor="nt-name">
        {t('today.newTaskName')}
      </label>
      <input id="nt-name" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      <span className="label">{t('today.newTaskKind')}</span>
      <div className="radio-list">
        {(['harvest', 'trees', 'quantity', 'done'] as InputKind[]).map((k) => (
          <label key={k} className="radio">
            <input type="radio" name="nt-kind" checked={kind === k} onChange={() => setKind(k)} />
            <span>{t(`inputKind.${k}`)}</span>
          </label>
        ))}
      </div>
      <div className="actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button type="button" className="btn primary" onClick={create}>
          {t('today.create')}
        </button>
      </div>
    </Modal>
  );
}

function NewUnitModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useTranslation();
  const { repo } = useFarm();
  const [name, setName] = useState('');
  const create = async () => {
    if (!name.trim()) return;
    const row = await repo.addUnit({ name: name.trim(), isDefault: false, archived: false });
    onCreated(row.id);
    onClose();
  };
  return (
    <Modal title={t('today.newUnit')} onClose={onClose}>
      <label className="label" htmlFor="nu-name">
        {t('today.newUnitName')}
      </label>
      <input id="nu-name" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      <div className="actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button type="button" className="btn primary" onClick={create}>
          {t('today.create')}
        </button>
      </div>
    </Modal>
  );
}

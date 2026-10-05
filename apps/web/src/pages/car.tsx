import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  FileText,
  Gauge,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Wallet,
  Wrench,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import { api, errorMessage, get, queryClient } from '@/shared/api';
import {
  Badge,
  Button,
  Drawer,
  DropdownMenu,
  EmptyState,
  ErrorState,
  Input,
  Pagination,
  Panel,
  Select,
  Skeleton,
  useToast,
} from '@/shared/ui';
import { cn, date, labels, money, number } from '@/shared/lib';
import { EditCarForm, EventForm, FileUploader, ReminderForm } from '@/features/forms';
import { useUI } from '@/features/ui-state';
import { CarPhoto } from '@/widgets/car';
import type { Car, HistoryEvent } from '@/entities';
import { Reports, Transfer } from './reports';
const tabs = [
  ['', 'Обзор'],
  ['history', 'История'],
  ['maintenance', 'ТО и ремонт'],
  ['expenses', 'Расходы'],
  ['mileage', 'Пробег'],
  ['parts', 'Детали'],
  ['accidents', 'ДТП'],
  ['documents', 'Документы'],
  ['reminders', 'Напоминания'],
  ['public-report', 'Публичный отчёт'],
  ['audit', 'Аудит'],
  ['transfer', 'Передача'],
];
export function CarPage() {
  const { id } = useParams();
  const section = useLocation().pathname.split('/')[3] ?? '';
  const navigate = useNavigate();
  const car = useQuery({ queryKey: ['car', id], queryFn: () => get<Car>(`/cars/${id}`) });
  const summary = useQuery({
    queryKey: ['summary', id],
    queryFn: () => get(`/cars/${id}/summary`),
    enabled: !!car.data && !car.data.archived,
  });
  const [kind, setKind] = useState<string | null>(null),
    [photo, setPhoto] = useState(false),
    [editingCar, setEditingCar] = useState(false),
    [reminder, setReminder] = useState(false);
  const toast = useToast();
  const { selectCar } = useUI();
  useEffect(() => {
    if (id) selectCar(id);
  }, [id, selectCar]);
  if (car.isPending) return <Skeleton />;
  if (car.isError) return <ErrorState retry={() => car.refetch()} />;
  const c = car.data;
  async function archive() {
    if (
      !window.confirm(
        c.archived ? 'Восстановить автомобиль?' : 'Архивировать автомобиль? Публичные ссылки будут отозваны.',
      )
    )
      return;
    try {
      if (c.archived) await api.post(`/cars/${id}/restore`);
      else await api.delete(`/cars/${id}`);
      queryClient.invalidateQueries();
      navigate('/cars');
    } catch (e) {
      toast.toast(errorMessage(e));
    }
  }
  return (
    <>
      <Link to="/cars" className="mb-5 inline-flex min-h-11 items-center gap-2 text-xs text-muted">
        <ArrowLeft size={15} />
        Мой гараж
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="mb-3 flex items-center gap-2">
            {c.demo && <Badge>Демонстрация</Badge>}
            <Badge tone={c.archived ? 'neutral' : 'green'}>
              {c.archived ? 'В архиве' : 'В вашем гараже'}
            </Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {c.brand} {c.model}
          </h1>
          <p className="mt-2 text-xs text-muted">
            {c.year} · {c.engineType || 'Двигатель не указан'} · VIN {c.vin ?? 'не указан'}
          </p>
        </div>
        <div className="flex gap-2">
          {!c.archived && (
            <DropdownMenu
              label={
                <>
                  <Plus size={16} />
                  Добавить запись
                </>
              }
              items={['maintenance', 'repair', 'expense', 'mileage', 'document', 'accident'].map((k) => ({
                label: labels[k],
                action: () => setKind(k),
              }))}
            />
          )}
          <DropdownMenu
            label="Действия"
            items={[
              ...(!c.archived
                ? [
                    { label: 'Изменить данные', action: () => setEditingCar(true) },
                    { label: 'Фото автомобиля', action: () => setPhoto(true) },
                    { label: 'Передать автомобиль', action: () => navigate(`/cars/${id}/transfer`) },
                  ]
                : []),
              { label: c.archived ? 'Восстановить' : 'Архивировать', action: () => void archive() },
            ]}
          >
            <Button variant="secondary" aria-label="Действия с автомобилем">
              <MoreHorizontal size={18} />
            </Button>
          </DropdownMenu>
        </div>
      </div>
      <nav className="mb-7 flex gap-5 overflow-x-auto border-b border-line">
        {tabs.map(([path, label]) => (
          <Link
            key={path}
            to={`/cars/${id}${path ? '/' + path : ''}`}
            className={cn(
              'min-h-12 shrink-0 border-b-2 py-3 text-xs',
              section === path
                ? 'border-accent font-medium text-accent'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      {c.archived ? (
        <Panel>
          <EmptyState
            title="Автомобиль в архиве"
            text="Восстановите автомобиль, чтобы продолжить вести историю."
            action={<Button onClick={archive}>Восстановить</Button>}
          />
        </Panel>
      ) : section === '' ? (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel className="overflow-hidden">
              <CarPhoto id={c.photos?.[0]?.id} name={`${c.brand} ${c.model}`} className="aspect-[16/10]" />
              <div className="flex items-center justify-between px-5 py-4">
                <span className="text-xs text-muted">
                  {c.color || 'Цвет не указан'} · {c.licensePlate || 'Номер не указан'}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setPhoto(true)}>
                  <Upload size={14} />
                  Фото
                </Button>
              </div>
            </Panel>
            <div className="space-y-5">
              <Panel className="p-6">
                <div className="flex items-center justify-between text-muted">
                  <span className="text-xs">Последнее показание одометра</span>
                  <Gauge size={20} />
                </div>
                <p className="mt-4 text-4xl font-semibold tabular-nums tracking-tight">
                  {number(c.latestMileage?.odometerKm ?? 0)}{' '}
                  <span className="text-base font-normal text-muted">км</span>
                </p>
                <p className="mt-2 text-xs text-muted">На {date(c.latestMileage?.date)}</p>
                <Button variant="ghost" className="mt-3 px-0 text-accent" onClick={() => setKind('mileage')}>
                  Обновить показание <ArrowRight size={15} />
                </Button>
              </Panel>
              <Panel className="grid grid-cols-2 divide-x divide-line p-6">
                <div>
                  <p className="text-xs text-muted">Расходы за всё время</p>
                  {summary.data?.totals.length ? (
                    summary.data.totals.map((t: any) => (
                      <p key={t.currency} className="mt-3 text-xl font-semibold">
                        {money(t.amount, t.currency)}
                      </p>
                    ))
                  ) : (
                    <p className="mt-3 text-xl">—</p>
                  )}
                </div>
                <div className="pl-5">
                  <p className="text-xs text-muted">Записей в истории</p>
                  <p className="mt-3 text-2xl font-semibold">{summary.data?.count ?? '—'}</p>
                </div>
              </Panel>
            </div>
          </div>
          <div className="mb-4 mt-8 flex items-center justify-between">
            <h2 className="text-base font-semibold">История автомобиля</h2>
            <Link to={`/cars/${id}/history`} className="flex min-h-11 items-center gap-2 text-xs text-accent">
              Все события <ArrowRight size={14} />
            </Link>
          </div>
          <History car={c} section="history" onAdd={() => setKind('maintenance')} />
        </>
      ) : ['history', 'maintenance', 'accidents', 'documents'].includes(section) ? (
        <History
          car={c}
          section={section}
          onAdd={() =>
            setKind(
              section === 'accidents' ? 'accident' : section === 'documents' ? 'document' : 'maintenance',
            )
          }
        />
      ) : section === 'expenses' ? (
        <Expenses car={c} onAdd={() => setKind('expense')} />
      ) : section === 'mileage' ? (
        <Mileage car={c} onAdd={() => setKind('mileage')} />
      ) : section === 'parts' ? (
        <Parts car={c} />
      ) : section === 'reminders' ? (
        <Reminders car={c} onAdd={() => setReminder(true)} />
      ) : section === 'public-report' ? (
        <Reports car={c} />
      ) : section === 'transfer' ? (
        <Transfer car={c} />
      ) : section === 'audit' ? (
        <Audit car={c} />
      ) : (
        <EmptyState title="Страница не найдена" text="Выберите раздел автомобиля." />
      )}
      {editingCar && <EditCarForm car={c} onClose={() => setEditingCar(false)} />}{' '}
      {kind && <EventForm car={c} kind={kind} onClose={() => setKind(null)} />}{' '}
      {reminder && <ReminderForm car={c} onClose={() => setReminder(false)} />}{' '}
      {photo && (
        <Drawer open onOpenChange={() => setPhoto(false)} title="Фотографии автомобиля">
          <div className="space-y-5 overflow-y-auto p-6">
            <p className="text-xs leading-5 text-muted">
              Первое фото используется на карточке. Публичная публикация и передача новому владельцу
              настраиваются отдельно.
            </p>
            {c.photos?.map((f, i) => (
              <div key={f.id}>
                <CarPhoto id={f.id} name={`${c.brand} ${c.model}`} className="rounded-control" />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await api.patch(`/files/${f.id}`, { photoPosition: 0 });
                      for (const [j, x] of c.photos.filter((x) => x.id !== f.id).entries())
                        await api.patch(`/files/${x.id}`, { photoPosition: j + 1 });
                      queryClient.invalidateQueries();
                    }}
                  >
                    {i === 0 ? 'Основное фото' : 'Сделать основным'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (window.confirm('Передавать это фото новому владельцу?')) {
                        await api.patch(`/files/${f.id}`, { transferAllowed: true });
                        toast.toast('Фото разрешено к передаче');
                      }
                    }}
                  >
                    Разрешить передачу
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!window.confirm('Удалить фотографию?')) return;
                      try {
                        await api.delete(`/files/${f.id}`);
                        queryClient.invalidateQueries();
                      } catch (e) {
                        toast.toast(errorMessage(e));
                      }
                    }}
                  >
                    <Trash2 size={14} />
                    Удалить
                  </Button>
                </div>
              </div>
            ))}
            <FileUploader photo carId={c.id} files={[]} onChange={() => queryClient.invalidateQueries()} />
          </div>
        </Drawer>
      )}
      {toast.node}
    </>
  );
}
function usePages(key: string[], url: string) {
  return useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) =>
      get(`${url}${url.includes('?') ? '&' : '?'}limit=30${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
export function History({ car, section, onAdd }: { car: Car; section: string; onAdd: () => void }) {
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<HistoryEvent | null>(null),
    [editing, setEditing] = useState<HistoryEvent | null>(null);
  const q = new URLSearchParams(params);
  q.delete('event');
  const list = usePages(['events', car.id, section, q.toString()], `/cars/${car.id}/${section}?${q}`);
  const linked = useQuery({
    queryKey: ['event', params.get('event')],
    queryFn: () => get<HistoryEvent>(`/events/${params.get('event')}`),
    enabled: !!params.get('event'),
  });
  const detail = selected ?? linked.data;
  const toast = useToast();
  const events = list.data?.pages.flatMap((p) => p.items) as HistoryEvent[] | undefined;
  function filter(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next);
  }
  function close() {
    setSelected(null);
    if (params.has('event')) {
      const p = new URLSearchParams(params);
      p.delete('event');
      setParams(p);
    }
  }
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-40 flex-1">
          <Search size={15} className="absolute left-3 top-3.5 text-muted" />
          <Input
            aria-label="Поиск по истории"
            placeholder="Найти запись…"
            className="pl-9"
            value={params.get('q') ?? ''}
            onChange={(e) => filter('q', e.target.value)}
          />
        </div>
        {section === 'history' && (
          <Select
            aria-label="Тип события"
            className="w-auto"
            value={params.get('kind') ?? ''}
            onChange={(e) => filter('kind', e.target.value)}
          >
            <option value="">Все события</option>
            {['maintenance', 'repair', 'expense', 'mileage', 'accident', 'document'].map((k) => (
              <option key={k} value={k}>
                {labels[k]}
              </option>
            ))}
          </Select>
        )}
        <Input
          aria-label="Начало периода"
          type="date"
          className="w-auto max-w-full"
          value={params.get('from') ?? ''}
          onChange={(e) => filter('from', e.target.value)}
        />
        <Button onClick={onAdd} variant="secondary">
          <Plus size={15} />
          Добавить
        </Button>
      </div>
      {list.isPending ? (
        <Skeleton />
      ) : list.isError ? (
        <ErrorState retry={() => list.refetch()} />
      ) : (
        <Panel>
          {!events?.length ? (
            <EmptyState action={<Button onClick={onAdd}>Добавить запись</Button>} />
          ) : (
            <div className="divide-y divide-line">
              {events.map((e, i) => (
                <div key={e.id}>
                  {(i === 0 ||
                    new Date(e.date).getFullYear() !== new Date(events[i - 1].date).getFullYear()) && (
                    <div className="bg-page/50 px-5 py-3 text-[11px] font-semibold text-muted">
                      {new Date(e.date).getFullYear()}
                    </div>
                  )}
                  <button
                    onClick={() => setSelected(e)}
                    className="flex w-full items-center gap-3 px-4 py-5 text-left hover:bg-page/50 sm:gap-4 sm:px-6"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-control bg-page">
                      <EventIcon kind={e.kind} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] text-muted">{date(e.date)}</span>
                        <span className="text-[10px] text-muted">· {labels[e.kind]}</span>
                      </div>
                      <p className="truncate text-sm font-medium">{e.title}</p>
                      <p className="mt-1.5 text-[11px] text-muted">
                        {e.odometerKm !== null ? `${number(e.odometerKm)} км` : ''}
                        {e.files?.length ? ` · ${e.files.length} влож.` : ''}
                        {e.parts?.length ? ` · ${e.parts.length} дет.` : ''}
                      </p>
                    </div>
                    {Number(e.totalCost) > 0 && (
                      <span className="hidden shrink-0 text-xs font-medium tabular-nums sm:block">
                        {money(e.totalCost, e.currency)}
                      </span>
                    )}
                    <ChevronRight size={16} className="shrink-0 text-muted" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Pagination
            hasMore={list.hasNextPage}
            load={() => list.fetchNextPage()}
            loading={list.isFetchingNextPage}
          />
        </Panel>
      )}
      {detail && (
        <Drawer
          open
          onOpenChange={close}
          title={detail.title}
          description={`${labels[detail.kind]} · ${date(detail.date)} · версия ${detail.version}`}
        >
          <div className="flex-1 space-y-6 overflow-y-auto p-6">
            <div className="flex flex-wrap gap-2">
              <Badge>
                {detail.odometerKm !== null ? `${number(detail.odometerKm)} км` : 'Без показания'}
              </Badge>
              <Badge tone="blue">{money(detail.totalCost, detail.currency)}</Badge>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-6 text-muted">
              {detail.description || 'Описание не добавлено'}
            </p>
            {detail.parts?.length > 0 && (
              <div>
                <h3 className="mb-3 font-semibold">Детали</h3>
                {detail.parts.map((p) => (
                  <div key={p.id} className="flex justify-between gap-4 border-b border-line py-3 text-xs">
                    <span>
                      {p.name}
                      <span className="mt-1 block text-muted">
                        {p.brand} · {p.article}
                      </span>
                    </span>
                    <span>
                      {p.quantity} {p.unit} × {money(p.unitPrice, detail.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {detail.kind === 'document' && (
              <p className="text-xs text-muted">
                Действует до: {date(detail.data.expiresAt)}. Передача:{' '}
                {detail.transferAllowed ? 'разрешена' : 'запрещена'}.
              </p>
            )}
            {detail.kind === 'accident' && (
              <p className="text-xs text-muted">
                Оценка ущерба: {money(detail.data.estimatedDamage ?? 0, detail.currency)}. Эта оценка не
                добавлена к расходам.
              </p>
            )}
            {detail.files?.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      const r = await get(`/files/${f.id}/download`);
                      window.open(r.url, '_blank', 'noopener,noreferrer');
                    } catch (e) {
                      toast.toast(errorMessage(e));
                    }
                  }}
                >
                  <Download size={15} />
                  <span className="max-w-64 truncate">{f.name}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (window.confirm('Разрешить передачу этого файла следующему владельцу?')) {
                      await api.patch(`/files/${f.id}`, { transferAllowed: true });
                      toast.toast('Передача файла разрешена');
                    }
                  }}
                >
                  Передача
                </Button>
              </div>
            ))}
            <p className="rounded-control bg-page p-4 text-xs leading-5 text-muted">
              Сведения добавлены владельцем. Изменения сохраняются в журнале аудита.
            </p>
          </div>
          <div className="flex justify-between border-t border-line p-6">
            <Button
              variant="ghost"
              onClick={async () => {
                if (!window.confirm('Удалить запись и исключить связанные расходы и пробег из расчётов?'))
                  return;
                try {
                  await api.delete(`/events/${detail.id}?version=${detail.version}`);
                  close();
                  queryClient.invalidateQueries();
                } catch (e) {
                  toast.toast(errorMessage(e));
                }
              }}
            >
              <Trash2 size={16} />
              Удалить
            </Button>
            <Button
              onClick={() => {
                setEditing(detail);
                close();
              }}
            >
              <Pencil size={16} />
              Изменить
            </Button>
          </div>
        </Drawer>
      )}
      {editing && (
        <EventForm car={car} kind={editing.kind} existing={editing} onClose={() => setEditing(null)} />
      )}{' '}
      {toast.node}
    </>
  );
}
function EventIcon({ kind }: { kind: string }) {
  const Icon =
    kind === 'document' ? FileText : kind === 'mileage' ? Gauge : kind === 'expense' ? Wallet : Wrench;
  return <Icon size={18} strokeWidth={1.6} className="text-muted" />;
}
function Expenses({ car, onAdd }: { car: Car; onAdd: () => void }) {
  const [currency, setCurrency] = useState(car.currency),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),[category,setCategory]=useState('');
  const stats = useQuery({
    queryKey: ['stats', car.id, currency, from, to, category],
    queryFn: () =>
      get(
        `/cars/${car.id}/expenses/stats?currency=${currency}${from ? '&from=' + from : ''}${to ? '&to=' + to : ''}${category?'&category='+category:''}`,
      ),
  });
  const list = usePages(['expenses', car.id, currency, from, to, category], `/cars/${car.id}/expenses?currency=${currency}${from?'&from='+from:''}${to?'&to='+to:''}${category?'&category='+category:''}`);
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  const monthly: Record<string, number> = {};
  for (const r of stats.data?.rows ?? []) monthly[r.month] = (monthly[r.month] ?? 0) + Number(r.amount);
  return (
    <>
      <div className="mb-5 flex flex-wrap gap-3">
        <Select
          aria-label="Валюта расходов"
          className="w-auto"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as any)}
        >
          {['KGS', 'KZT', 'USD', 'EUR'].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Input
          aria-label="Расходы с даты"
          type="date"
          className="w-auto max-w-full"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          aria-label="Расходы до даты"
          type="date"
          className="w-auto max-w-full"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Select aria-label="Категория расходов" className="w-auto" value={category} onChange={e=>setCategory(e.target.value)}><option value="">Все категории</option>{['maintenance','repair','fuel','insurance','tax','tires','wash','parking','parts','tuning','fines','other'].map(k=><option key={k} value={k}>{labels[k]}</option>)}</Select><Button onClick={onAdd}>
          <Plus size={16} />
          Добавить расход
        </Button>
      </div>
      <Panel className="mb-6 p-6">
        <p className="text-xs text-muted">Итого за выбранный период · {currency}</p>
        <p className="mt-3 text-3xl font-semibold">{money(stats.data?.totals?.[0]?.amount ?? 0, currency)}</p>
        <p className="mb-6 mt-2 text-xs text-muted">
          Цена покупки не включена. Другие валюты учитываются отдельно.
        </p>
        <div className="h-52 w-full min-w-0">
          <ResponsiveContainer>
            <BarChart data={Object.entries(monthly).map(([month, amount]) => ({ month, amount }))}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={55} />
              <ChartTooltip formatter={(v: any) => money(v, currency)} />
              <Bar name="Расходы" dataKey="amount" fill="#2457F5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {stats.data?.rows.map((r: any, i: number) => (
            <Badge key={i}>
              {r.month} · {labels[r.category]}: {money(r.amount, r.currency)}
            </Badge>
          ))}
        </div>
      </Panel>
      <Panel>
        {list.isError ? (
          <ErrorState retry={() => list.refetch()} />
        ) : !rows.length ? (
          <EmptyState
            title="Расходов пока нет"
            text="Запишите первый расход или добавьте обслуживание со стоимостью."
            action={<Button onClick={onAdd}>Добавить расход</Button>}
          />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((e: any) => (
              <Link
                key={e.id}
                to={`/cars/${car.id}/history?event=${e.eventId}`}
                className="flex items-center justify-between gap-3 p-5 hover:bg-page"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {date(e.date)} · {labels[e.category]}
                    {e.kind !== 'expense' ? ' · Из записи обслуживания' : ''}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums">{money(e.amount, e.currency)}</p>
              </Link>
            ))}
          </div>
        )}
        <Pagination hasMore={list.hasNextPage} load={() => list.fetchNextPage()} />
      </Panel>
    </>
  );
}
function Mileage({ car, onAdd }: { car: Car; onAdd: () => void }) {
  const q = usePages(['mileage', car.id], `/cars/${car.id}/mileage`);
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button onClick={onAdd}>
          <Plus size={16} />
          Добавить показание
        </Button>
      </div>
      <Panel className="mb-5 p-6">
        <h2 className="mb-2 font-semibold">Показания одометра</h2>
        <p className="mb-5 text-xs text-muted">
          График загруженных записей. Замена одометра начинает новый участок.
        </p>
        <div className="h-60">
          <ResponsiveContainer>
            <LineChart
              data={[...rows].reverse().flatMap((r) =>
                r.changeType === 'replacement'
                  ? [
                      { date: date(r.date), km: null },
                      { date: date(r.date), km: r.odometerKm },
                    ]
                  : [{ date: date(r.date), km: r.odometerKm }],
              )}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={60} domain={['auto', 'auto']} />
              <ChartTooltip formatter={(v: any) => `${number(v)} км`} />
              <Line
                name="Одометр"
                type="linear"
                dataKey="km"
                stroke="#2457F5"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel>
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5 last:border-0"
          >
            <div>
              <p className="text-sm font-semibold">{number(r.odometerKm)} км</p>
              <p className="mt-1 text-xs text-muted">
                {date(r.date)} ·{' '}
                {r.source === 'service'
                  ? 'Обслуживание'
                  : r.source === 'document'
                    ? 'Документ'
                    : 'Ввод владельца'}
              </p>
              {r.reason && <p className="mt-2 text-xs text-warn">{r.reason}</p>}
            </div>
            <div className="flex items-center gap-3">
              {r.changeType === 'replacement' && <Badge tone="amber">Замена одометра</Badge>}
              {r.eventId && (
                <Link
                  to={`/cars/${car.id}/history?event=${r.eventId}`}
                  className="min-h-11 py-3 text-xs text-accent"
                >
                  Исходная запись
                </Link>
              )}
            </div>
          </div>
        ))}
        <Pagination hasMore={q.hasNextPage} load={() => q.fetchNextPage()} />
      </Panel>
    </>
  );
}
function Parts({ car }: { car: Car }) {
  const q = usePages(['parts', car.id], `/cars/${car.id}/parts`);
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (q.isPending) return <Skeleton />;
  if (q.isError) return <ErrorState retry={() => q.refetch()} />;
  return (
    <Panel>
      {!rows.length ? (
        <EmptyState
          title="Детали пока не добавлены"
          text="Добавьте детали в запись ТО или ремонта — здесь появятся их сроки службы."
        />
      ) : (
        rows.map((p) => (
          <Link
            key={p.id}
            to={`/cars/${car.id}/history?event=${p.eventId}`}
            className="flex flex-wrap items-center justify-between gap-4 border-b border-line p-5 last:border-0 hover:bg-page"
          >
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="mt-1 text-xs text-muted">
                {p.brand} · {p.article || 'Без артикула'} · {p.quantity} {p.unit}
              </p>
              <p className="mt-2 text-xs text-muted">
                Установка {date(p.date)} · {p.position || 'Позиция не указана'}
              </p>
            </div>
            <div className="text-right">
              <Badge tone={p.replaced ? 'neutral' : 'green'}>{p.replaced ? 'Заменена' : 'Установлена'}</Badge>
              <p className="mt-2 text-xs text-muted">
                {p.distance !== null ? `${number(p.distance)} км с установки` : 'Расстояние неизвестно'}
              </p>
            </div>
          </Link>
        ))
      )}
      <Pagination hasMore={q.hasNextPage} load={() => q.fetchNextPage()} />
    </Panel>
  );
}
function Reminders({ car, onAdd }: { car: Car; onAdd: () => void }) {
  const [completed, setCompleted] = useState(false);
  const [editing,setEditing]=useState<any>(null);
  const q = usePages(
    ['reminders', car.id, String(completed)],
    `/cars/${car.id}/reminders?status=${completed ? 'completed' : 'active'}`,
  );
  const m = useMutation({
    mutationFn: ({ r, status, repeat }: { r: any; status: string; repeat?: boolean }) =>
      api.patch(`/reminders/${r.id}`, { status, version: r.version, repeat }),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <div className="mb-5 flex flex-wrap justify-between gap-3">
        <Select
          className="w-auto"
          aria-label="Статус напоминаний"
          value={String(completed)}
          onChange={(e) => setCompleted(e.target.value === 'true')}
        >
          <option value="false">Активные</option>
          <option value="true">Выполненные</option>
        </Select>
        <Button onClick={onAdd}>
          <Plus size={16} />
          Напоминание
        </Button>
      </div>
      {m.isError && <ErrorState message={errorMessage(m.error)} />}
      <Panel>
        {!rows.length ? (
          <EmptyState
            title="Напоминаний пока нет"
            text="Укажите дату или пробег следующего обслуживания."
            action={<Button onClick={onAdd}>Создать напоминание</Button>}
          />
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap justify-between gap-5 border-b border-line p-5 last:border-0"
            >
              <div>
                <Badge tone={r.urgency === 'overdue' ? 'red' : r.urgency === 'soon' ? 'amber' : 'neutral'}>
                  {r.status === 'completed'
                    ? 'Выполнено'
                    : r.urgency === 'overdue'
                      ? 'Срок наступил'
                      : r.urgency === 'soon'
                        ? 'Скоро'
                        : 'Запланировано'}
                </Badge>
                <h3 className="mt-3 font-semibold">{r.title}</h3>
                <p className="mt-2 text-xs text-muted">
                  {r.targetDate ? date(r.targetDate) : ''}
                  {r.targetDate && r.targetKm !== null ? ' или ' : ''}
                  {r.targetKm !== null ? `${number(r.targetKm)} км` : ''}
                </p>
                {r.kmUncertain && (
                  <p className="mt-2 text-xs text-warn">
                    После замены одометра условие по пробегу требует обновления.
                  </p>
                )}
              </div>
              {!completed && (
                <div className="flex flex-wrap items-center gap-2"><Button variant="ghost" size="sm" onClick={()=>setEditing(r)}>Изменить</Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={m.isPending}
                    onClick={() => m.mutate({ r, status: 'completed' })}
                  >
                    <Check size={15} />
                    Выполнено
                  </Button>
                  {(r.repeatKm || r.repeatMonths) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => m.mutate({ r, status: 'completed', repeat: true })}
                    >
                      Выполнить и повторить
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    aria-label={`Отменить ${r.title}`}
                    onClick={() => m.mutate({ r, status: 'dismissed' })}
                  >
                    <XIcon />
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
        <Pagination hasMore={q.hasNextPage} load={() => q.fetchNextPage()} />
      </Panel>
      {editing&&<ReminderForm car={car} existing={editing} onClose={()=>setEditing(null)}/>}
    </>
  );
}
function XIcon() {
  return <Trash2 size={15} />;
}
function Audit({ car }: { car: Car }) {
  const q = usePages(['audit', car.id], `/cars/${car.id}/audit`);
  return (
    <Panel>
      <div className="border-b border-line p-5">
        <h2 className="font-semibold">Журнал изменений</h2>
        <p className="mt-2 text-xs text-muted">
          Ваши действия сохраняются вместе с изменениями. Личные данные прежних владельцев закрыты.
        </p>
      </div>
      {q.data?.pages
        .flatMap((p) => p.items)
        .map((a: any) => (
          <details key={a.id} className="border-b border-line p-5 last:border-0">
            <summary className="cursor-pointer text-xs">
              {date(a.createdAt)} · {a.action} · {a.entityType} · версия {a.version}
            </summary>
            <pre className="mt-3 overflow-x-auto rounded bg-page p-3 text-[10px]">
              {JSON.stringify({ before: a.oldData, after: a.newData }, null, 2)}
            </pre>
          </details>
        ))}
      <Pagination hasMore={q.hasNextPage} load={() => q.fetchNextPage()} />
    </Panel>
  );
}

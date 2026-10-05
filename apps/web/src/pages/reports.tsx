import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy, Download, ExternalLink, FileText, Link2, Plus, RefreshCw, Shield } from 'lucide-react';
import QRCode from 'qrcode';
import { api, errorMessage, get, queryClient } from '@/shared/api';
import {
  Badge,
  Button,
  Checkbox,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Panel,
  Skeleton,
  useToast,
} from '@/shared/ui';
import { date, labels, money, number } from '@/shared/lib';
import { Logo } from '@/widgets/layout';
import type { Car } from '@/entities';
import { useSession } from '@/features/session';
const defaults = {
  maintenance: true,
  repair: true,
  mileage: true,
  parts: true,
  accident: false,
  expense: false,
  document: false,
  licensePlate: false,
  fileIds: [] as string[],
};
export function Reports({ car }: { car: Car }) {
  const reports = useQuery({
    queryKey: ['reports', car.id],
    queryFn: () => get(`/cars/${car.id}/public-reports`),
  });
  const [open, setOpen] = useState(false),
    [title, setTitle] = useState('История автомобиля'),
    [expires, setExpires] = useState(''),
    [settings, setSettings] = useState(defaults),
    [selectedEvents, setSelectedEvents] = useState<string[] | null>(null),
    [preview, setPreview] = useState<any>(null),
    [qr, setQr] = useState<any>(null);
  const toast = useToast();
  const events = useQuery({
    queryKey: ['publication-events', car.id],
    queryFn: () => get(`/cars/${car.id}/history?limit=100`),
    enabled: open,
  });
  const input = () => ({
    title,
    settings: { ...settings, ...(selectedEvents ? { eventIds: selectedEvents } : {}) },
    ...(expires ? { expiresAt: new Date(`${expires}T23:59:59Z`).toISOString() } : {}),
  });
  const create = useMutation({
    mutationFn: () => api.post(`/cars/${car.id}/public-reports`, input()),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setOpen(false);
      toast.toast('Отчёт опубликован');
    },
  });
  const previewMutation = useMutation({
    mutationFn: () => api.post(`/cars/${car.id}/public-reports/preview`, input()),
    onSuccess: (r) => setPreview(r.data),
  });
  async function action(path: string, method: 'post' | 'delete') {
    try {
      await api[method](path);
      queryClient.invalidateQueries();
      toast.toast(method === 'delete' ? 'Ссылка отозвана' : 'Снимок отчёта обновлён');
    } catch (e) {
      toast.toast(errorMessage(e));
    }
  }
  const files = [
    ...(car.photos ?? []).map((p) => ({ id: p.id, name: 'Фото автомобиля' })),
    ...(events.data?.items ?? [])
      .filter((e: any) => (settings as any)[e.kind] && (!selectedEvents || selectedEvents.includes(e.id)))
      .flatMap((e: any) => e.files ?? []),
  ];
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">История для покупателя</h2>
          <p className="mt-2 text-xs text-muted">
            Выберите, что показать. Личные сведения останутся закрытыми.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} />
          Создать отчёт
        </Button>
      </div>
      <div className="mb-6 flex gap-3 rounded-panel border border-accent/15 bg-accent/5 p-5">
        <Shield size={20} className="shrink-0 text-accent" />
        <p className="text-xs leading-6 text-muted">
          Отчёт — снимок истории на дату публикации. Изменения записей отмечаются, но не заменяют снимок
          автоматически. VIN всегда маскируется.
        </p>
      </div>
      {reports.isPending ? (
        <Skeleton />
      ) : reports.isError ? (
        <ErrorState retry={() => reports.refetch()} />
      ) : !reports.data.items.length ? (
        <Panel>
          <EmptyState
            title="Публичных отчётов пока нет"
            text="Покупатель сможет открыть выбранную историю без регистрации."
            action={<Button onClick={() => setOpen(true)}>Создать первый отчёт</Button>}
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          {reports.data.items.map((r: any) => (
            <Panel key={r.id} className="p-5">
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{r.title}</h3>
                  <p className="mt-2 text-xs text-muted">
                    Версия {r.currentVersion} · {date(r.createdAt)}
                    {r.expiresAt ? ` · До ${date(r.expiresAt)}` : ''}
                  </p>
                </div>
                <Badge tone={r.active ? 'green' : 'neutral'}>{r.active ? 'Активен' : 'Отозван'}</Badge>
              </div>
              {r.active && (
                <>
                  <div className="mt-5 flex min-w-0 items-center gap-2 rounded-control bg-page px-3">
                    <Link2 size={15} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate text-xs text-muted">{r.url}</span>
                    <Button
                      variant="ghost"
                      aria-label="Копировать ссылку"
                      onClick={async () => {
                        await navigator.clipboard.writeText(r.url);
                        toast.toast('Ссылка скопирована');
                      }}
                    >
                      <Copy size={15} />
                    </Button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      href={`/r/${r.token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line px-3 text-xs"
                    >
                      <ExternalLink size={14} />
                      Открыть
                    </a>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () =>
                        setQr({ url: r.url, png: await QRCode.toDataURL(r.url, { width: 512, margin: 2 }) })
                      }
                    >
                      QR-код
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => action(`/public-reports/${r.id}/publish`, 'post')}
                    >
                      <RefreshCw size={14} />
                      Обновить отчёт
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      onClick={() => {
                        if (window.confirm('Отозвать ссылку? Покупатель больше не сможет открыть отчёт.'))
                          action(`/public-reports/${r.id}`, 'delete');
                      }}
                    >
                      Отозвать
                    </Button>
                  </div>
                </>
              )}
            </Panel>
          ))}
        </div>
      )}
      {open && (
        <Drawer
          open
          onOpenChange={() => setOpen(false)}
          title="Публикация истории"
          description="Проверьте состав отчёта перед публикацией."
        >
          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            <Field label="Название отчёта" htmlFor="report-title">
              <Input id="report-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Срок действия (необязательно)" htmlFor="report-expiry">
              <Input
                id="report-expiry"
                type="date"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </Field>
            <h3 className="font-semibold">Включить в отчёт</h3>
            {Object.entries(defaults)
              .filter(([k]) => k !== 'fileIds')
              .map(([k]) => (
                <label key={k} className="flex min-h-11 items-center justify-between border-b border-line">
                  <span>{labels[k]}</span>
                  <Checkbox
                    checked={(settings as any)[k]}
                    onChange={(e) => {
                      setSettings({ ...settings, [k]: e.target.checked, fileIds: [] });
                      setPreview(null);
                    }}
                  />
                </label>
              ))}
            <h3 className="pt-3 font-semibold">Состав событий</h3>
            <label className="flex min-h-11 items-center gap-3">
              <Checkbox
                checked={selectedEvents === null}
                onChange={(e) => setSelectedEvents(e.target.checked ? null : [])}
              />
              Все события включённых разделов
            </label>
            {selectedEvents !== null &&
              events.data?.items
                .filter((e: any) => (settings as any)[e.kind])
                .map((e: any) => (
                  <label key={e.id} className="flex min-h-11 items-center gap-3 text-xs">
                    <Checkbox
                      checked={selectedEvents.includes(e.id)}
                      onChange={(v) =>
                        setSelectedEvents(
                          v.target.checked
                            ? [...selectedEvents, e.id]
                            : selectedEvents.filter((id) => id !== e.id),
                        )
                      }
                    />
                    {date(e.date)} · {e.title}
                  </label>
                ))}
            {events.data?.nextCursor && (
              <p className="text-xs text-muted">
                Показаны последние 100 записей для выбора. Режим «Все» включает всю доступную историю до 2000
                событий.
              </p>
            )}
            <h3 className="pt-3 font-semibold">Разрешённые вложения</h3>
            <p className="text-xs leading-5 text-muted">
              Проверьте документы на наличие адресов и личных данных. По умолчанию файлы не публикуются.
            </p>
            {files.map((f: any) => (
              <label key={f.id} className="flex min-h-11 items-center gap-3 text-xs">
                <Checkbox
                  checked={settings.fileIds.includes(f.id)}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      fileIds: e.target.checked
                        ? [...settings.fileIds, f.id]
                        : settings.fileIds.filter((id) => id !== f.id),
                    })
                  }
                />
                {f.name}
              </label>
            ))}
            {!files.length && (
              <p className="text-xs text-muted">Нет доступных вложений в выбранных категориях.</p>
            )}
            {preview && (
              <div className="rounded-control border border-line p-4">
                <p className="font-medium">Предпросмотр снимка</p>
                <p className="mt-2 text-xs">
                  {preview.car.brand} {preview.car.model} · VIN {preview.car.vin ?? 'не указан'}
                </p>
                <p className="mt-2 text-xs text-muted">
                  {preview.events.length} событий · {preview.mileage.length} показаний одометра
                </p>
                <p className="mt-2 text-xs text-muted">
                  Не включено: {preview.excluded.map((k: string) => labels[k]).join(', ')}
                </p>
                {preview.events.map((e: any) => (
                  <p key={e.id} className="mt-2 text-xs">
                    {date(e.date)} · {e.title}
                  </p>
                ))}
              </div>
            )}
            {(create.isError || previewMutation.isError) && (
              <p role="alert" className="text-danger">
                {errorMessage(create.error ?? previewMutation.error)}
              </p>
            )}
          </div>
          <div className="flex justify-between gap-3 border-t border-line p-6">
            <Button
              variant="secondary"
              loading={previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              Предпросмотр
            </Button>
            <Button loading={create.isPending} onClick={() => create.mutate()}>
              Опубликовать
            </Button>
          </div>
        </Drawer>
      )}
      {qr && (
        <Drawer open onOpenChange={() => setQr(null)} title="QR-код отчёта">
          <div className="space-y-5 p-6">
            <img src={qr.png} alt="QR-код публичного отчёта" className="mx-auto w-64 max-w-full" />
            <a
              href={qr.png}
              download="carhistory-qr.png"
              className="flex min-h-11 items-center justify-center gap-2 rounded-control bg-accent px-4 text-white"
            >
              <Download size={16} />
              Скачать PNG
            </a>
            <Button
              className="w-full"
              variant="secondary"
              onClick={async () => {
                const svg = await QRCode.toString(qr.url, { type: 'svg' });
                const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
                const a = document.createElement('a');
                a.href = url;
                a.download = 'carhistory-qr.svg';
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              Скачать SVG
            </Button>
          </div>
        </Drawer>
      )}
      {toast.node}
    </>
  );
}
export function PublicReport() {
  const { token } = useParams();
  const q = useQuery({
    queryKey: ['public-report', token],
    queryFn: () => get(`/public/reports/${token}`),
    retry: false,
  });
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex,nofollow';
    document.head.append(meta);
    const referrer = document.createElement('meta');
    referrer.name = 'referrer';
    referrer.content = 'no-referrer';
    document.head.append(referrer);
    return () => {
      meta.remove();
      referrer.remove();
    };
  }, []);
  const toast = useToast();
  if (q.isPending)
    return (
      <div className="mx-auto max-w-4xl p-8">
        <Skeleton />
      </div>
    );
  if (q.isError)
    return (
      <div className="mx-auto max-w-xl px-5 py-16">
        <Logo />
        <Panel className="mt-10">
          <EmptyState
            title="Отчёт недоступен"
            text="Ссылка отозвана, срок действия истёк или владелец переместил автомобиль в архив."
            action={
              <Link to="/" className="text-accent">
                На главную
              </Link>
            }
          />
        </Panel>
      </div>
    );
  const r = q.data;
  return (
    <div className="mx-auto max-w-[960px] px-4 py-7 md:px-8 md:py-12">
      <div className="mb-12 flex items-center justify-between">
        <Logo />
        <Badge>Публичный отчёт</Badge>
      </div>
      <Badge tone="blue">Сведения владельца</Badge>
      <h1 className="mt-5 text-4xl font-semibold tracking-tight">
        {r.car.brand} {r.car.model}
      </h1>
      <p className="mt-3 text-sm text-muted">
        {r.car.year} · VIN {r.car.vin ?? 'не указан'}
        {r.car.licensePlate ? ` · ${r.car.licensePlate}` : ''}
      </p>
      <div className="my-7 flex flex-wrap gap-4 border-y border-line py-5 text-xs text-muted">
        <span>Опубликовано: {date(r.publishedAt)}</span>
        <span>Снимок: {date(r.updatedAt)}</span>
        <span>Версия {r.version}</span>
      </div>
      {r.hasChanges && (
        <div className="mb-6 rounded-panel border border-amber-200 bg-amber-50 p-5 text-xs leading-6 text-warn">
          После публикации история была изменена. Ниже сохранён первоначальный снимок.{' '}
          {r.changeNotices
            .map((c: any) => c.message)
            .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
            .join(' ')}
        </div>
      )}
      <p className="mb-6 max-w-2xl text-sm leading-7 text-muted">{r.disclaimer}</p>
      <Panel className="mb-8 p-5">
        <h2 className="font-semibold">Ограничения полноты</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {r.excluded.map((k: string) => (
            <Badge key={k}>
              {k === 'accident' ? 'Данные о ДТП не включены в отчёт' : `${labels[k]}: не включено`}
            </Badge>
          ))}
        </div>
      </Panel>
      <div className="mb-6 grid grid-cols-2 gap-5">
        <Panel className="p-5">
          <p className="text-xs text-muted">Опубликованных событий</p>
          <p className="mt-2 text-3xl font-semibold">{r.events.length}</p>
        </Panel>
        <Panel className="p-5">
          <p className="text-xs text-muted">Последнее опубликованное показание</p>
          <p className="mt-2 text-2xl font-semibold">
            {r.mileage[0] ? `${number(r.mileage[0].odometerKm)} км` : 'Не включено'}
          </p>
          <p className="mt-2 text-xs text-muted">{r.mileage[0] ? date(r.mileage[0].date) : ''}</p>
        </Panel>
      </div>
      <h2 className="mb-5 text-xl font-semibold">История автомобиля</h2>
      <Panel>
        {r.events.map((e: any) => (
          <div key={e.id} className="border-b border-line p-5 last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge>{labels[e.kind]}</Badge>
              <span className="text-xs text-muted">{date(e.date)}</span>
            </div>
            <h3 className="mt-4 font-semibold">{e.title}</h3>
            <p className="mt-2 text-xs text-muted">
              {e.odometerKm !== null ? `${number(e.odometerKm)} км` : ''}
              {e.totalCost ? ` · ${money(e.totalCost, e.currency)}` : ''}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{e.description}</p>
            {e.parts?.map((p: any, i: number) => (
              <Badge key={i}>
                {p.name} · {p.quantity} {p.unit}
              </Badge>
            ))}
            {e.files?.map((f: any) => (
              <Button
                key={f.id}
                variant="secondary"
                className="mt-3 max-w-full"
                onClick={async () => {
                  try {
                    const data = await get(`/public/reports/${token}/files/${f.id}`);
                    window.open(data.url, '_blank', 'noopener,noreferrer');
                  } catch (err) {
                    toast.toast(errorMessage(err));
                  }
                }}
              >
                <FileText size={15} />
                <span className="truncate">{f.name}</span>
              </Button>
            ))}
          </div>
        ))}
        {!r.events.length && (
          <EmptyState title="События не опубликованы" text="Владелец не включил записи в этот снимок." />
        )}
      </Panel>
      {r.changes?.length > 0 && (
        <Panel className="mt-6 p-5">
          <h3 className="font-semibold">Изменения опубликованной истории</h3>
          {r.changes.map((c: any, i: number) => (
            <p key={i} className="mt-3 text-xs text-muted">
              {c.message}
            </p>
          ))}
        </Panel>
      )}
      <p className="mt-10 text-center text-xs text-muted">
        CarHistory · История автомобиля, сохранённая владельцем
      </p>
      {toast.node}
    </div>
  );
}
export function Transfer({ car }: { car: Car }) {
  const [email, setEmail] = useState('');
  const { user } = useSession();
  const list = useQuery({
    queryKey: ['invitations', car.id],
    queryFn: () => get(`/cars/${car.id}/ownership-invitations`),
  });
  const m = useMutation({
    mutationFn: () => api.post(`/cars/${car.id}/ownership-invitations`, { email }),
    onSuccess: () => {
      setEmail('');
      queryClient.invalidateQueries();
    },
  });
  return (
    <div className="max-w-2xl">
      <Panel className="p-6">
        <h2 className="text-lg font-semibold">Передать автомобиль</h2>
        <p className="mt-3 text-sm leading-7 text-muted">
          Новый владелец получит техническую историю автомобиля. Ваши личные документы и вложения останутся
          закрытыми, кроме файлов, для которых вы явно разрешили передачу. Ваши публичные ссылки будут
          отозваны.
        </p>
        <p className="mt-3 text-sm leading-7 text-muted">
          Передача произойдёт только после подтверждения получателем. Приглашение действует 7 дней.
        </p>
        {!user?.emailVerified && (
          <p className="my-4 text-xs text-warn">
            Сначала подтвердите email в{' '}
            <Link to="/settings" className="underline">
              настройках аккаунта
            </Link>
            .
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
          className="mt-6 space-y-4"
        >
          <Field label="Email нового владельца" htmlFor="recipient">
            <Input
              type="email"
              required
              id="recipient"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Button loading={m.isPending} disabled={!user?.emailVerified}>
            Отправить приглашение
          </Button>
          {m.isSuccess && (
            <p role="status" className="text-success">
              Приглашение поставлено в очередь отправки.
            </p>
          )}
          {m.isError && (
            <p role="alert" className="text-danger">
              {errorMessage(m.error)}
            </p>
          )}
        </form>
      </Panel>
      <div className="mt-5 space-y-3">
        {list.data?.items.map((i: any) => (
          <Panel key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-xs font-medium">{i.email}</p>
              <p className="mt-1 text-xs text-muted">
                {i.status} · до {date(i.expiresAt)}
              </p>
            </div>
            {i.status === 'pending' && (
              <Button
                variant="ghost"
                onClick={async () => {
                  await api.delete(`/ownership-invitations/${i.id}`);
                  queryClient.invalidateQueries();
                }}
              >
                Отменить
              </Button>
            )}
          </Panel>
        ))}
      </div>
    </div>
  );
}
export function AcceptTransfer() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const m = useMutation({
    mutationFn: () => api.post('/ownership-invitations/accept', { token: params.get('token') }),
    onSuccess: (r) => {
      queryClient.invalidateQueries();
      navigate(`/cars/${r.data.carId}`);
    },
  });
  return (
    <Panel className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Принять автомобиль</h1>
      <p className="my-5 text-sm leading-7 text-muted">
        В ваш гараж перейдёт автомобиль и его техническая история. Приватные документы прежнего владельца не
        передаются без отдельного разрешения. Для подтверждения нужен аккаунт с email получателя приглашения.
      </p>
      <Button loading={m.isPending} onClick={() => m.mutate()}>
        Подтвердить передачу
      </Button>
      {m.isError && (
        <p role="alert" className="mt-4 text-danger">
          {errorMessage(m.error)}
        </p>
      )}
    </Panel>
  );
}

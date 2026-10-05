import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CarFront,
  ChevronRight,
  CircleCheck,
  Clock3,
  Gauge,
  Plus,
  Shield,
  Wrench,
} from 'lucide-react';
import { get } from '@/shared/api';
import { Badge, Button, EmptyState, ErrorState, Panel, Skeleton } from '@/shared/ui';
import { date, money, number, cn } from '@/shared/lib';
import { CarForm } from '@/features/forms';
import { useSession } from '@/features/session';
import { useUI } from '@/features/ui-state';
import { CarPhoto } from '@/widgets/car';
import type { Car, Page } from '@/entities';
export function Dashboard({ garage = false }: { garage?: boolean }) {
  const [create, setCreate] = useState(false),
    [archived, setArchived] = useState(false);
  const navigate = useNavigate();
  const { selectCar } = useUI();
  const { user } = useSession();
  const cars = useQuery({
    queryKey: ['cars', archived],
    queryFn: () => get<Page<Car>>(`/cars?archived=${archived}`),
  });
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => get('/dashboard') });
  if (cars.isPending) return <Skeleton />;
  if (cars.isError) return <ErrorState retry={() => cars.refetch()} />;
  const total = dashboard.data?.totals ?? [];
  const attention = dashboard.data?.attention ?? [];
  return (
    <>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[11px] text-muted">
            <span className="size-1.5 rounded-full bg-success" />
            {new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(
              new Date(),
            )}
          </div>
          <h1 className="text-[28px] font-semibold tracking-[-1px] md:text-[32px]">
            Ваш гараж<span className="text-muted/40">.</span>
          </h1>
          <p className="mt-2 text-xs leading-6 text-muted">
            {garage
              ? 'Все ваши автомобили и их история.'
              : `Здравствуйте, ${user?.firstName}. Всё важное о ваших автомобилях — здесь.`}
          </p>
        </div>
        <Button onClick={() => setCreate(true)} variant="secondary" className="mt-6">
          <Plus size={16} />
          Добавить автомобиль
        </Button>
      </div>
      {!garage && cars.data.items.length > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div className="flex items-start gap-4 border-b border-line pb-5 sm:border-b-0 sm:border-r">
            <div className="flex size-10 items-center justify-center rounded-control border border-line bg-white">
              <CarFront size={19} className="text-muted" />
            </div>
            <div>
              <p className="text-[11px] text-muted">Автомобилей в гараже</p>
              <p className="mt-1 text-[26px] font-semibold tracking-tight">{cars.data.items.length}</p>
            </div>
          </div>
          <div className="flex items-start gap-4 border-b border-line pb-5 sm:border-b-0 sm:border-r">
            <div className="flex size-10 items-center justify-center rounded-control border border-line bg-white">
              <Wrench size={18} className="text-muted" />
            </div>
            <div>
              <p className="text-[11px] text-muted">Записей в истории</p>
              <p className="mt-1 text-[26px] font-semibold tracking-tight">
                {dashboard.data?.eventCount ?? '—'}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 pb-5">
            <div className="flex size-10 items-center justify-center rounded-control border border-line bg-white">
              <CalendarDays size={18} className="text-muted" />
            </div>
            <div>
              <p className="text-[11px] text-muted">Расходы за {new Date().getFullYear()} год</p>
              <p className="mt-1 text-[26px] font-semibold tracking-tight">
                {total.length ? money(total[0].amount, total[0].currency) : '—'}
              </p>
              {total.slice(1).map((t: any) => (
                <p key={t.currency} className="text-xs text-muted">
                  {money(t.amount, t.currency)}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className={cn('grid gap-7', !garage && 'xl:grid-cols-[minmax(0,1fr)_300px]')}>
        <div className="min-w-0">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Мои автомобили{' '}
              <span className="ml-2 text-xs font-normal text-muted">{cars.data.items.length}</span>
            </h2>
            <div className="flex gap-3 text-xs">
              <button
                onClick={() => setArchived(false)}
                className={cn('min-h-11', !archived ? 'font-medium text-ink' : 'text-muted')}
              >
                Активные
              </button>
              <button
                onClick={() => setArchived(true)}
                className={cn('min-h-11', archived ? 'font-medium text-ink' : 'text-muted')}
              >
                Архив
              </button>
            </div>
          </div>
          {!cars.data.items.length ? (
            <Panel>
              <EmptyState
                title={archived ? 'Архив пуст' : 'Добро пожаловать в ваш гараж'}
                text={
                  archived
                    ? 'Здесь появятся архивные автомобили.'
                    : 'Добавьте автомобиль, чтобы сохранять обслуживание, пробег и расходы.'
                }
                action={
                  !archived && (
                    <Button onClick={() => setCreate(true)}>
                      <Plus size={16} />
                      Добавить автомобиль
                    </Button>
                  )
                }
              />
            </Panel>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {cars.data.items.map((c) => {
                const annual = dashboard.data?.carTotals?.find(
                  (t: any) => t.carId === c.id && t.currency === c.currency,
                );
                const reminder = dashboard.data?.attention?.find((r: any) => r.carId === c.id);
                return (
                  <Panel key={c.id} className="overflow-hidden">
                    <Link to={`/cars/${c.id}`} onClick={() => selectCar(c.id)} className="relative block">
                      <CarPhoto id={c.photos?.[0]?.id} name={`${c.brand} ${c.model}`} />
                      <div className="absolute left-4 top-4">
                        <Badge tone={c.demo ? 'neutral' : 'green'}>
                          {c.demo ? 'Демонстрация' : 'В гараже'}
                        </Badge>
                      </div>
                      <div className="absolute bottom-3 right-3 flex size-8 items-center justify-center rounded-full bg-white">
                        <ArrowUpRight size={16} />
                      </div>
                    </Link>
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Link to={`/cars/${c.id}`} className="text-lg font-semibold tracking-tight">
                            {c.brand} {c.model}
                          </Link>
                          <p className="mt-1 text-[11px] text-muted">
                            {c.year}
                            {c.engineType ? ` · ${c.engineType}` : ''}
                            {c.transmission ? ` · ${c.transmission}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="mt-5 flex items-center justify-between border-y border-line py-4">
                        <div>
                          <p className="mb-1 text-[10px] text-muted">Текущий одометр</p>
                          <p className="text-sm font-semibold tabular-nums">
                            {number(c.latestMileage?.odometerKm ?? 0)}{' '}
                            <span className="font-normal text-muted">км</span>
                          </p>
                        </div>
                        <Gauge size={20} strokeWidth={1.5} className="text-muted/60" />
                      </div>
                      <div className="space-y-3 py-4">
                        <div className="flex items-start gap-2.5">
                          <Wrench size={14} className="mt-0.5 shrink-0 text-muted" />
                          <div className="min-w-0">
                            <p className="text-[10px] text-muted">Последняя запись</p>
                            <p className="mt-1 truncate text-xs">
                              {c.lastEvent?.title ?? 'История ещё не начата'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <Bell size={14} className={reminder ? 'text-warn' : 'text-muted'} />
                          <p className="text-[11px] text-muted">
                            {reminder?.title ?? 'Нет ближайших напоминаний'}
                          </p>
                        </div>
                      </div>
                      <Link
                        to={`/cars/${c.id}`}
                        className="flex min-h-11 items-center justify-between border-t border-line pt-3 text-xs font-medium"
                      >
                        Открыть историю <ArrowRight size={15} />
                      </Link>
                      {annual && (
                        <p className="mt-2 text-[10px] text-muted">
                          За год: {money(annual.amount, annual.currency)}
                        </p>
                      )}
                    </div>
                  </Panel>
                );
              })}
            </div>
          )}
          {!garage && cars.data.items.length > 0 && (
            <Panel className="mt-7">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h2 className="text-sm font-semibold">Последние события</h2>
                <Clock3 size={16} className="text-muted" />
              </div>
              {dashboard.data?.events?.length ? (
                dashboard.data.events.map((e: any) => (
                  <Link
                    key={e.id}
                    to={`/cars/${e.carId}/history?event=${e.id}`}
                    className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0 hover:bg-page/40"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-control bg-page">
                      <Wrench size={16} className="text-muted" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{e.title}</p>
                      <p className="mt-1 text-[10px] text-muted">
                        {e.carName} · {date(e.date)}
                      </p>
                    </div>
                    <ChevronRight size={15} className="text-muted" />
                  </Link>
                ))
              ) : (
                <EmptyState />
              )}
            </Panel>
          )}
        </div>
        {!garage && (
          <aside className="space-y-6">
            <Panel className="mt-[60px] overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h2 className="text-sm font-semibold">Требует внимания</h2>
                <Badge tone={attention.length ? 'amber' : 'green'}>{attention.length}</Badge>
              </div>
              {attention.length ? (
                attention.slice(0, 5).map((r: any) => (
                  <Link
                    to={`/cars/${r.carId}/reminders`}
                    key={r.id}
                    className="block border-b border-line p-5 last:border-0 hover:bg-page/50"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          r.urgency === 'overdue' ? 'bg-danger' : 'bg-warn',
                        )}
                      />
                      <span
                        className={cn(
                          'text-[10px] font-medium',
                          r.urgency === 'overdue' ? 'text-danger' : 'text-warn',
                        )}
                      >
                        {r.urgency === 'overdue' ? 'Срок наступил' : 'Скоро'}
                      </span>
                    </div>
                    <p className="text-xs font-semibold">{r.title}</p>
                    <p className="mt-1.5 text-[11px] text-muted">{r.carName}</p>
                    <p className="mt-3 text-[11px] text-muted">
                      {r.targetDate ? date(r.targetDate) : `На ${number(r.targetKm)} км`}
                    </p>
                  </Link>
                ))
              ) : (
                <div className="p-6">
                  <CircleCheck size={25} className="mb-3 text-success" />
                  <p className="text-xs font-medium">Всё спокойно</p>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    Нет приближающихся или просроченных напоминаний.
                  </p>
                </div>
              )}
            </Panel>
            <div className="rounded-panel border border-accent/15 bg-accent/5 p-5">
              <Shield size={22} strokeWidth={1.5} className="mb-4 text-accent" />
              <h3 className="text-sm font-semibold leading-6">
                История, которой
                <br />
                можно поделиться
              </h3>
              <p className="mt-3 text-xs leading-6 text-muted">
                Соберите выбранные записи в один отчёт для будущего владельца. Вы решаете, что показать.
              </p>
              <Link
                to={cars.data.items[0] ? `/cars/${cars.data.items[0].id}/public-report` : '/cars'}
                className="mt-5 inline-flex min-h-11 items-center gap-2 text-xs font-medium text-accent"
              >
                Создать отчёт <ArrowUpRight size={15} />
              </Link>
            </div>
          </aside>
        )}
      </div>
      {create && (
        <CarForm
          onClose={() => setCreate(false)}
          onSaved={(c) => {
            selectCar(c.id);
            setCreate(false);
            navigate(`/cars/${c.id}`);
          }}
        />
      )}
    </>
  );
}

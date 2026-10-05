import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Bell,
  CarFront,
  ChevronDown,
  CircleHelp,
  Clock3,
  Home,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  Wallet,
  X,
} from 'lucide-react';
import { api, get, queryClient } from '@/shared/api';
import { cn, labels } from '@/shared/lib';
import { DropdownMenu, IconButton } from '@/shared/ui';
import { useSession } from '@/features/session';
import { useUI } from '@/features/ui-state';
import { CarForm, EventForm } from '@/features/forms';
import type { Car, Page } from '@/entities';
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link
      to="/dashboard"
      className={cn('flex items-center gap-2.5 text-lg font-bold tracking-[-0.8px]', light && 'text-white')}
    >
      <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-white">
        <Activity size={20} strokeWidth={2.5} />
      </div>
      CarHistory<span className="text-accent">.</span>
    </Link>
  );
}
export function Layout() {
  const { user, logout } = useSession();
  const { selectedCar, selectCar } = useUI();
  const cars = useQuery({ queryKey: ['cars'], queryFn: () => get<Page<Car>>('/cars') });
  const navigate = useNavigate();
  const location = useLocation();
  const routeCar = location.pathname.match(/^\/cars\/([^/]+)/)?.[1];
  const selected = cars.data?.items.find((c) => c.id === (routeCar ?? selectedCar)) ?? cars.data?.items[0];
  const [carForm, setCarForm] = useState(false),
    [kind, setKind] = useState<string | null>(null),
    [mobile, setMobile] = useState(false),
    [search, setSearch] = useState(''),
    [debounced, setDebounced] = useState(''),
    [bell, setBell] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setMobile(false), [location.pathname]);
  const results = useQuery({
    queryKey: ['search', debounced],
    queryFn: ({ signal }) => get(`/search?q=${encodeURIComponent(debounced)}`, signal),
    enabled: debounced.length >= 2,
  });
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => get('/notifications'),
    enabled: bell,
  });
  const carLink = (section: string) => (selected ? `/cars/${selected.id}/${section}` : '/cars');
  const nav = [
    { to: '/dashboard', label: 'Обзор', icon: Home },
    { to: '/cars', label: 'Мой гараж', icon: CarFront },
    { to: carLink('history'), label: 'История', icon: Clock3 },
    { to: carLink('expenses'), label: 'Расходы', icon: Wallet },
    { to: carLink('reminders'), label: 'Напоминания', icon: Bell },
  ];
  function add(k: string) {
    if (!selected) {
      setCarForm(true);
      return;
    }
    setKind(k);
  }
  const sidebar = (
    <>
      <div className="px-6 pb-10 pt-8">
        <Logo />
      </div>
      <div className="px-4">
        <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[1.5px] text-muted">
          Рабочее пространство
        </p>
        <nav className="space-y-1">
          {nav.map((i, index) => (
            <NavLink
              key={i.label}
              to={i.to}
              end={index < 2}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center gap-3 rounded-control px-3 text-[13px] font-medium transition-colors',
                  isActive ? 'bg-accent/8 text-accent' : 'text-muted hover:bg-page hover:text-ink',
                )
              }
            >
              <i.icon size={18} />
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="my-7 border-t border-line" />
        <div className="mb-3 flex items-center justify-between px-3">
          <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-muted">Мои автомобили</p>
          <button
            onClick={() => setCarForm(true)}
            aria-label="Добавить автомобиль"
            className="flex min-h-11 min-w-11 items-center justify-center"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="space-y-2">
          {cars.data?.items.map((c) => (
            <Link
              key={c.id}
              to={`/cars/${c.id}`}
              onClick={() => selectCar(c.id)}
              className={cn(
                'flex min-h-12 items-center gap-3 rounded-control px-3 py-2 hover:bg-page',
                selected?.id === c.id && 'bg-page',
              )}
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-white text-[9px] font-bold">
                {c.brand.slice(0, 3).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">
                  {c.brand} {c.model}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">{c.year}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
      <div className="mt-auto p-4">
        <div className="mb-5 rounded-control border border-line p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
            <CircleHelp size={16} />
            История под контролем
          </div>
          <p className="text-[11px] leading-5 text-muted">
            Сохраняйте важное сегодня, чтобы помнить детали завтра.
          </p>
        </div>
        <NavLink to="/settings" className="flex min-h-11 items-center gap-3 px-3 text-xs text-muted">
          <Settings2 size={18} />
          Настройки
        </NavLink>
      </div>
      <Link to="/profile" className="flex items-center gap-3 border-t border-line p-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-page font-semibold">
          {user?.firstName.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{user?.firstName}</p>
          <p className="mt-1 text-[11px] text-muted">Личный аккаунт</p>
        </div>
        <ChevronDown size={14} className="ml-auto text-muted" />
      </Link>
    </>
  );
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-white lg:flex">
        {sidebar}
      </aside>
      {mobile && (
        <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setMobile(false)}>
          <aside
            className="flex h-full w-64 flex-col overflow-y-auto bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="relative z-20 flex h-[76px] items-center justify-between gap-3 border-b border-line bg-white px-4 md:px-8">
          <IconButton aria-label="Открыть меню" className="lg:hidden" onClick={() => setMobile(true)}>
            <Menu size={20} />
          </IconButton>
          <div className="relative w-full max-w-md">
            <div className="flex items-center gap-3">
              <Search size={18} className="shrink-0 text-muted" />
              <input
                aria-label="Поиск по гаражу"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по вашему гаражу"
                className="min-h-11 w-full min-w-0 bg-transparent text-xs outline-none placeholder:text-muted"
              />
              {search && (
                <IconButton aria-label="Очистить поиск" onClick={() => setSearch('')}>
                  <X size={14} />
                </IconButton>
              )}
            </div>
            {debounced.length >= 2 && (
              <div className="absolute inset-x-0 top-12 z-40 max-h-80 overflow-y-auto rounded-panel border border-line bg-white p-2 shadow-lg">
                {results.isPending ? (
                  <p className="p-3 text-muted">Поиск…</p>
                ) : results.isError ? (
                  <p role="alert" className="p-3 text-danger">
                    Не удалось выполнить поиск
                  </p>
                ) : (
                  <>
                    {results.data?.cars.map((c: any) => (
                      <Link
                        key={c.id}
                        onClick={() => setSearch('')}
                        to={`/cars/${c.id}`}
                        className="block rounded-control p-3 hover:bg-page"
                      >
                        {c.brand} {c.model}
                      </Link>
                    ))}
                    {results.data?.events.map((e: any) => (
                      <Link
                        key={e.id}
                        onClick={() => setSearch('')}
                        to={`/cars/${e.carId}/history?event=${e.id}`}
                        className="block rounded-control p-3 hover:bg-page"
                      >
                        {e.title}
                        <span className="ml-2 text-xs text-muted">{labels[e.kind]}</span>
                      </Link>
                    ))}
                    {results.data?.parts.map((p: any) => (
                      <Link
                        key={p.id}
                        onClick={() => setSearch('')}
                        to={`/cars/${p.event.carId}/parts`}
                        className="block rounded-control p-3 hover:bg-page"
                      >
                        {p.name}
                      </Link>
                    ))}
                    {!results.data?.cars.length &&
                      !results.data?.events.length &&
                      !results.data?.parts.length && <p className="p-3 text-muted">Ничего не найдено</p>}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <div className="hidden sm:block">
              <DropdownMenu
                label={
                  <>
                    <Plus size={16} />
                    Добавить запись
                  </>
                }
                items={Object.entries(labels)
                  .filter(([k]) =>
                    ['maintenance', 'repair', 'expense', 'mileage', 'document', 'accident'].includes(k),
                  )
                  .map(([k, l]) => ({ label: l, action: () => add(k) }))}
              />
            </div>
            <div className="relative">
              <IconButton aria-label="Уведомления" onClick={() => setBell(!bell)}>
                <Bell size={19} />
              </IconButton>
              {bell && (
                <div className="absolute right-0 top-12 z-50 w-72 rounded-panel border border-line bg-white p-3 shadow-lg">
                  <h3 className="p-2 font-semibold">Уведомления</h3>
                  {notifications.data?.items.length ? (
                    notifications.data.items.map((n: any) => (
                      <button
                        key={n.id}
                        className={cn(
                          'block min-h-14 w-full rounded-control p-3 text-left hover:bg-page',
                          !n.readAt && 'bg-accent/5',
                        )}
                        onClick={async () => {
                          await api.patch(`/notifications/${n.id}/read`);
                          queryClient.invalidateQueries({ queryKey: ['notifications'] });
                          if (n.carId) navigate(`/cars/${n.carId}/reminders`);
                          setBell(false);
                        }}
                      >
                        <p className="text-xs font-medium">{n.title}</p>
                        <p className="mt-1 text-xs text-muted">{n.body}</p>
                      </button>
                    ))
                  ) : (
                    <p className="p-3 text-xs text-muted">
                      {notifications.isPending ? 'Загрузка…' : 'Новых уведомлений нет'}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="hidden h-7 border-l border-line sm:block" />
            <DropdownMenu
              label="Профиль"
              items={[
                { label: 'Профиль', action: () => navigate('/profile') },
                { label: 'Активные сессии', action: () => navigate('/sessions') },
                { label: 'Выйти', icon: <LogOut size={15} />, action: () => void logout() },
              ]}
            >
              <button
                aria-label="Меню профиля"
                className="flex min-h-11 min-w-11 items-center justify-center"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-page text-xs font-semibold">
                  {user?.firstName.slice(0, 1)}
                </span>
              </button>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 pb-28 pt-7 md:px-8 md:pt-9 lg:pb-10 xl:px-10">
          <Outlet />
        </main>
        <footer className="mx-auto hidden max-w-[1440px] items-center justify-between border-t border-line px-10 py-6 text-[10px] text-muted lg:flex">
          <span>© {new Date().getFullYear()} CarHistory</span>
          <span>У каждой машины своя история.</span>
        </footer>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {[
          { to: '/dashboard', label: 'Главная', icon: Home },
          { to: '/cars', label: 'Гараж', icon: CarFront },
        ].map((i) => (
          <Link
            key={i.to}
            to={i.to}
            className="flex min-h-16 min-w-14 flex-col items-center justify-center gap-1 text-[10px] text-muted"
          >
            <i.icon size={19} />
            {i.label}
          </Link>
        ))}
        <DropdownMenu
          label="Добавить"
          items={['maintenance', 'repair', 'expense', 'mileage', 'document', 'accident'].map((k) => ({
            label: labels[k],
            action: () => add(k),
          }))}
        >
          <button className="flex min-h-16 min-w-14 flex-col items-center justify-center gap-1 text-[10px] text-accent">
            <Plus size={22} />
            Добавить
          </button>
        </DropdownMenu>
        <Link
          to={carLink('history')}
          className="flex min-h-16 min-w-14 flex-col items-center justify-center gap-1 text-[10px] text-muted"
        >
          <Clock3 size={19} />
          История
        </Link>
        <Link
          to="/profile"
          className="flex min-h-16 min-w-14 flex-col items-center justify-center gap-1 text-[10px] text-muted"
        >
          <Settings2 size={19} />
          Профиль
        </Link>
      </nav>
      {carForm && (
        <CarForm
          onClose={() => setCarForm(false)}
          onSaved={(c) => {
            selectCar(c.id);
            setCarForm(false);
            navigate(`/cars/${c.id}`);
          }}
        />
      )}
      {kind && selected && <EventForm car={selected} kind={kind} onClose={() => setKind(null)} />}
    </div>
  );
}

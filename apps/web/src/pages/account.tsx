import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { Laptop, LogOut, Shield } from 'lucide-react';
import { api, errorMessage, get, queryClient } from '@/shared/api';
import { Badge, Button, Checkbox, Field, Input, Panel, Select, Skeleton, useToast } from '@/shared/ui';
import { date } from '@/shared/lib';
import { FileUploader } from '@/features/forms';
import { useSession } from '@/features/session';
export function Account() {
  const { user, setUser, logout } = useSession();
  const section = useLocation().pathname;
  const [name, setName] = useState(user?.firstName ?? ''),
    [email, setEmail] = useState(user?.email ?? ''),
    [currency, setCurrency] = useState(user?.currency ?? 'KGS'),
    [timezone, setTimezone] = useState(user?.timezone ?? 'Asia/Bishkek'),
    [mail, setMail] = useState(user?.emailNotifications ?? false),
    [current, setCurrent] = useState(''),
    [password, setPassword] = useState('');
  const toast = useToast();
  const m = useMutation({
    mutationFn: () =>
      api.patch('/profile', { firstName: name, email, currency, timezone, emailNotifications: mail }),
    onSuccess: (r) => {
      setUser(r.data);
      toast.toast(
        email !== r.data.email
          ? 'Настройки сохранены. Подтвердите новый email по письму.'
          : 'Профиль сохранён',
      );
    },
  });
  const change = useMutation({
    mutationFn: () => api.post('/profile/change-password', { currentPassword: current, password }),
    onSuccess: () => {
      setUser(null);
      queryClient.clear();
    },
  });
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => get('/sessions'),
    enabled: section === '/sessions',
  });
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-7 text-3xl font-semibold tracking-tight">
        {section === '/sessions' ? 'Активные сессии' : section === '/settings' ? 'Настройки' : 'Ваш профиль'}
      </h1>
      <nav className="mb-6 flex gap-5 border-b border-line pb-4 text-xs">
        <Link to="/profile">Профиль</Link>
        <Link to="/settings">Настройки</Link>
        <Link to="/sessions">Сессии</Link>
      </nav>
      {section === '/sessions' ? (
        <>
          <p className="mb-5 text-sm text-muted">
            Завершение сессии сразу блокирует доступ с этого устройства.
          </p>
          {sessions.isPending ? (
            <Skeleton />
          ) : (
            sessions.data?.items.map((s: any) => (
              <Panel key={s.id} className="mb-4 flex flex-wrap items-center gap-4 p-5">
                <Laptop size={24} className="text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium" title={s.userAgent}>
                    {s.userAgent}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    Создана {date(s.createdAt)} · Активность {date(s.lastSeenAt)}
                  </p>
                  {s.current && <Badge tone="green">Текущая сессия</Badge>}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    await api.delete(`/sessions/${s.id}`);
                    if (s.current) {
                      setUser(null);
                      queryClient.clear();
                    } else queryClient.invalidateQueries({ queryKey: ['sessions'] });
                  }}
                >
                  Завершить
                </Button>
              </Panel>
            ))
          )}
          <Button
            variant="danger"
            onClick={async () => {
              if (window.confirm('Завершить все сессии, включая текущую?')) {
                await api.delete('/sessions');
                setUser(null);
                queryClient.clear();
              }
            }}
          >
            Завершить все сессии
          </Button>
        </>
      ) : (
        <>
          <Panel className="p-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                m.mutate();
              }}
              className="space-y-5"
            >
              <div className="mb-6 flex items-center gap-4">
                <div className="flex size-16 items-center justify-center rounded-full bg-page text-2xl font-semibold">
                  {name.slice(0, 1)}
                </div>
                <div>
                  <h2 className="font-semibold">Личные данные</h2>
                  <p className="mt-1 text-xs text-muted">Они не публикуются в отчётах.</p>
                </div>
              </div>
              <ProfilePhoto/>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Имя" htmlFor="profile-name">
                  <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} required />
                </Field>
                <Field label="Email" htmlFor="profile-email">
                  <Input
                    id="profile-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Валюта по умолчанию" htmlFor="profile-currency">
                  <Select
                    id="profile-currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as any)}
                  >
                    {['KGS', 'KZT', 'USD', 'EUR'].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Часовой пояс" htmlFor="profile-timezone">
                  <Input
                    id="profile-timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                  />
                </Field>
              </div>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <Checkbox checked={mail} onChange={(e) => setMail(e.target.checked)} />
                Получать напоминания по email
              </label>
              {m.isError && (
                <p role="alert" className="text-danger">
                  {errorMessage(m.error)}
                </p>
              )}
              <Button loading={m.isPending}>Сохранить изменения</Button>
            </form>
          </Panel>
          <Panel className="mt-5 flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex gap-3">
              <Shield size={22} className={user?.emailVerified ? 'text-success' : 'text-warn'} />
              <div>
                <p className="text-sm font-medium">
                  {user?.emailVerified ? 'Email подтверждён' : 'Подтвердите ваш email'}
                </p>
                <p className="mt-1 text-xs text-muted">Нужен для писем и передачи автомобиля.</p>
              </div>
            </div>
            {!user?.emailVerified && (
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await api.post('/auth/resend-verification');
                    toast.toast('Письмо поставлено в очередь отправки');
                  } catch (e) {
                    toast.toast(errorMessage(e));
                  }
                }}
              >
                Отправить письмо
              </Button>
            )}
          </Panel>
          {section === '/settings' && (
            <>
              <Panel className="mt-5 p-6">
                <h2 className="mb-5 font-semibold">Сменить пароль</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    change.mutate();
                  }}
                  className="space-y-4"
                >
                  <Field label="Текущий пароль" htmlFor="current-password">
                    <Input
                      id="current-password"
                      type="password"
                      value={current}
                      onChange={(e) => setCurrent(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </Field>
                  <Field label="Новый пароль" htmlFor="new-password">
                    <Input
                      id="new-password"
                      type="password"
                      minLength={8}
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                  </Field>
                  <p className="text-xs text-muted">После изменения все сессии будут завершены.</p>
                  {change.isError && (
                    <p role="alert" className="text-danger">
                      {errorMessage(change.error)}
                    </p>
                  )}
                  <Button loading={change.isPending}>Изменить пароль</Button>
                </form>
              </Panel>
              <ServiceCenters />
            </>
          )}
          <Button className="mt-5" variant="ghost" onClick={() => logout()}>
            <LogOut size={16} />
            Выйти из аккаунта
          </Button>
        </>
      )}
      {toast.node}
    </div>
  );
}
function ServiceCenters() {
  const [name, setName] = useState(''),
    [address, setAddress] = useState(''),
    [phone, setPhone] = useState('');
  const q = useQuery({ queryKey: ['service-centers'], queryFn: () => get('/service-centers') });
  const m = useMutation({
    mutationFn: () => api.post('/service-centers', { name, address, phone }),
    onSuccess: () => {
      setName('');
      setAddress('');
      setPhone('');
      queryClient.invalidateQueries({ queryKey: ['service-centers'] });
    },
  });
  return (
    <Panel className="mt-5 p-6">
      <h2 className="font-semibold">Ваши СТО</h2>
      <p className="mt-2 text-xs text-muted">
        Личный справочник. Название СТО не подтверждает выполнение работ.
      </p>
      {q.data?.items.map((c: any) => (
        <div key={c.id} className="border-b border-line py-4">
          <p className="text-sm">{c.name}</p>
          <p className="mt-1 text-xs text-muted">
            {c.address} · {c.phone}
          </p>
        </div>
      ))}
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        {[
          ['Название', name, setName],
          ['Адрес', address, setAddress],
          ['Телефон', phone, setPhone],
        ].map(([label, value, set]: any) => (
          <Field key={label} label={label} htmlFor={`center-${label}`}>
            <Input
              id={`center-${label}`}
              value={value}
              onChange={(e) => set(e.target.value)}
              required={label === 'Название'}
            />
          </Field>
        ))}
        {m.isError && (
          <p role="alert" className="text-danger">
            {errorMessage(m.error)}
          </p>
        )}
        <Button loading={m.isPending}>Добавить СТО</Button>
      </form>
    </Panel>
  );
}

function ProfilePhoto(){const {user,setUser}=useSession();const q=useQuery({queryKey:['avatar',user?.avatarFileId],queryFn:()=>get(`/files/${user?.avatarFileId}/download`),enabled:!!user?.avatarFileId,staleTime:240000});return <div className="space-y-3">{q.data&&<img src={q.data.url} alt="Фото профиля" className="size-20 rounded-full object-cover"/>}<details><summary className="min-h-11 cursor-pointer py-3 text-xs font-medium text-accent">Изменить фото профиля</summary><FileUploader avatar photo files={[]} onChange={async()=>{setUser(await get('/profile'));queryClient.invalidateQueries({queryKey:['avatar']});}}/></details></div>;}

import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { email, password } from '@carhistory/validation';
import { ArrowRight, Check, Clock3, Shield, Wrench } from 'lucide-react';
import { api, errorMessage } from '@/shared/api';
import { Button, Field, Input, Panel } from '@/shared/ui';
import { useSession } from '@/features/session';
import { Logo } from '@/widgets/layout';
export function AuthPage({
  mode,
}: {
  mode: 'login' | 'register' | 'forgot-password' | 'reset-password' | 'verify-email';
}) {
  const { user, login } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [done, setDone] = useState(false);
  const schema =
    mode === 'register'
      ? z
          .object({ firstName: z.string().min(1, 'Введите имя'), email, password, confirm: z.string() })
          .refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'Пароли не совпадают' })
      : mode === 'login'
        ? z.object({ email, password: z.string().min(1) })
        : mode === 'forgot-password'
          ? z.object({ email })
          : mode === 'reset-password'
            ? z
                .object({ password, confirm: z.string() })
                .refine((d) => d.password === d.confirm, {
                  path: ['confirm'],
                  message: 'Пароли не совпадают',
                })
            : z.object({});
  const f = useForm<any>({ resolver: zodResolver(schema) });
  const m = useMutation({
    mutationFn: async (data: any) => {
      const { confirm: _confirm, ...body } = data;
      return api.post(`/auth/${mode}`, {
        ...body,
        ...(['reset-password', 'verify-email'].includes(mode) ? { token: params.get('token') } : {}),
      });
    },
    onSuccess: (r) => {
      if (['login', 'register'].includes(mode)) {
        login(r.data);
        const dest = params.get('next');
        navigate(
          dest?.startsWith('/') && !dest.startsWith('//') && !dest.includes('\\') ? dest : '/dashboard',
        );
      } else setDone(true);
    },
  });
  if (user && ['login', 'register'].includes(mode)) return <Navigate to="/dashboard" replace />;
  const title = {
    login: 'С возвращением',
    register: 'Начните свою историю',
    'forgot-password': 'Восстановление пароля',
    'reset-password': 'Новый пароль',
    'verify-email': 'Подтверждение email',
  }[mode];
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col bg-white p-6 md:p-12">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-16">
          <span className="mb-4 text-xs font-medium uppercase tracking-[2px] text-accent">
            Ваш автомобиль. Ваша история.
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mb-8 mt-3 text-sm leading-6 text-muted">
            {mode === 'login'
              ? 'Войдите, чтобы продолжить вести историю автомобиля.'
              : mode === 'register'
                ? 'Все работы, расходы и важные документы в одном месте.'
                : 'Следуйте инструкции для вашего аккаунта.'}
          </p>
          {done ? (
            <Panel className="p-5">
              <Check size={22} className="mb-3 text-success" />
              <p className="text-sm leading-6">
                {mode === 'forgot-password'
                  ? 'Если аккаунт существует, письмо с инструкцией поставлено в очередь отправки.'
                  : mode === 'verify-email'
                    ? 'Email подтверждён.'
                    : 'Пароль изменён. Войдите с новым паролем.'}
              </p>
              <Link to="/login" className="mt-4 inline-block text-accent">
                Перейти ко входу
              </Link>
            </Panel>
          ) : (
            <form onSubmit={f.handleSubmit((d) => m.mutate(d))} className="space-y-5">
              {mode === 'register' && (
                <Field
                  label="Ваше имя"
                  htmlFor="firstName"
                  error={f.formState.errors.firstName?.message as string}
                >
                  <Input id="firstName" autoComplete="given-name" {...f.register('firstName')} />
                </Field>
              )}
              {['login', 'register', 'forgot-password'].includes(mode) && (
                <Field label="Email" htmlFor="email" error={f.formState.errors.email?.message as string}>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    {...f.register('email')}
                    aria-describedby="email-error"
                  />
                </Field>
              )}
              {['login', 'register', 'reset-password'].includes(mode) && (
                <Field
                  label="Пароль"
                  htmlFor="password"
                  error={f.formState.errors.password?.message as string}
                >
                  <Input
                    id="password"
                    type="password"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    {...f.register('password')}
                    aria-describedby="password-error"
                  />
                </Field>
              )}
              {['register', 'reset-password'].includes(mode) && (
                <Field
                  label="Повторите пароль"
                  htmlFor="confirm"
                  error={f.formState.errors.confirm?.message as string}
                >
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    {...f.register('confirm')}
                    aria-describedby="confirm-error"
                  />
                </Field>
              )}
              {mode === 'login' && (
                <div className="text-right">
                  <Link to="/forgot-password" className="text-xs text-accent">
                    Забыли пароль?
                  </Link>
                </div>
              )}
              {m.isError && (
                <p role="alert" className="text-sm text-danger">
                  {errorMessage(m.error)}
                </p>
              )}
              <Button loading={m.isPending} className="w-full">
                {mode === 'login'
                  ? 'Войти'
                  : mode === 'register'
                    ? 'Создать аккаунт'
                    : mode === 'verify-email'
                      ? 'Подтвердить email'
                      : mode === 'reset-password'
                        ? 'Сохранить пароль'
                        : 'Отправить инструкцию'}
                <ArrowRight size={16} />
              </Button>
            </form>
          )}
          {['login', 'register'].includes(mode) && (
            <p className="mt-7 text-center text-xs text-muted">
              {mode === 'login' ? 'Ещё нет аккаунта?' : 'Уже зарегистрированы?'}{' '}
              <Link className="font-medium text-accent" to={mode === 'login' ? '/register' : '/login'}>
                {mode === 'login' ? 'Зарегистрироваться' : 'Войти'}
              </Link>
            </p>
          )}
        </div>
        <p className="text-xs text-muted">© {new Date().getFullYear()} CarHistory</p>
      </div>
      <div className="hidden flex-col justify-center bg-ink px-16 text-white lg:flex">
        <span className="text-xs uppercase tracking-[3px] text-white/50">Меньше забытых деталей</span>
        <h2 className="mt-6 max-w-lg text-5xl font-semibold leading-[1.15] tracking-[-2px]">
          У каждой машины
          <br />
          есть история.
          <br />
          <span className="text-white/45">Сохраните вашу.</span>
        </h2>
        <div className="mt-12 space-y-7">
          {[
            [Wrench, 'Всё обслуживание в одном журнале'],
            [Clock3, 'Напоминания о важном'],
            [Shield, 'Вы решаете, чем поделиться'],
          ].map(([Icon, text]: any) => (
            <div key={text} className="flex items-center gap-4 text-sm text-white/70">
              <Icon size={20} />
              {text}
            </div>
          ))}
        </div>
        <p className="mt-16 max-w-sm text-xs leading-6 text-white/40">
          Сведения в истории добавляет владелец. Прикреплённые документы помогают сохранить подробности, но не
          заменяют осмотр автомобиля.
        </p>
      </div>
    </div>
  );
}
export function Landing() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-7">
      <header className="flex items-center justify-between">
        <Logo />
        <Link
          to="/login"
          className="rounded-control border border-line bg-white px-5 py-3 text-xs font-medium"
        >
          Войти
        </Link>
      </header>
      <section className="grid gap-12 py-20 md:grid-cols-2 md:items-center md:py-28">
        <div>
          <p className="mb-5 text-xs font-medium uppercase tracking-[2px] text-accent">
            Личный автомобильный журнал
          </p>
          <h1 className="text-5xl font-semibold leading-[1.12] tracking-[-2px] md:text-6xl">
            История машины.
            <br />
            <span className="text-muted">В ваших руках.</span>
          </h1>
          <p className="mt-7 max-w-md text-base leading-8 text-muted">
            Обслуживание, пробег, расходы и документы — в одном месте. Для вас сегодня. Для нового владельца
            завтра.
          </p>
          <Link
            to="/register"
            className="mt-8 inline-flex min-h-12 items-center gap-3 rounded-control bg-accent px-6 font-medium text-white"
          >
            Создать гараж <ArrowRight size={17} />
          </Link>
        </div>
        <Panel className="p-7">
          <span className="text-xs text-muted">Пример отчёта · демонстрация</span>
          <h2 className="mt-4 text-2xl font-semibold">BMW 540i</h2>
          <p className="mt-2 text-xs text-muted">2019 · 140 421 км · VIN скрыт</p>
          <div className="my-6 border-t border-line" />
          {['Замена моторного масла', 'Плановое обслуживание', 'Новое показание одометра'].map((t, i) => (
            <div key={t} className="flex gap-4 py-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-control bg-page">
                <Wrench size={17} />
              </div>
              <div>
                <p className="text-sm font-medium">{t}</p>
                <p className="mt-2 text-xs text-muted">Запись владельца · пример {i + 1}</p>
              </div>
            </div>
          ))}
          <p className="mt-5 rounded-control bg-page p-4 text-xs leading-6 text-muted">
            Покупатель видит только выбранные вами данные. Это пример, не отчёт о реальном автомобиле.
          </p>
        </Panel>
      </section>
      <div className="grid gap-7 border-t border-line py-10 md:grid-cols-3">
        {[
          ['01', 'Сохраняйте', 'Одна запись связывает работу, детали, стоимость и пробег.'],
          ['02', 'Планируйте', 'Следите за сроками обслуживания и документов.'],
          ['03', 'Делитесь', 'Создавайте отчёт по ссылке и отзывайте доступ в любой момент.'],
        ].map(([n, t, d]) => (
          <div key={n}>
            <p className="text-xs text-muted">{n}</p>
            <h3 className="mt-3 font-semibold">{t}</h3>
            <p className="mt-3 text-sm leading-7 text-muted">{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

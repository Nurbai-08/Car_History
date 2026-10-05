import {
  forwardRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { AlertCircle, ArrowRight, CarFront, ChevronDown, LoaderCircle, X } from 'lucide-react';
import { cn } from '@/shared/lib';
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    loading?: boolean;
    size?: 'sm' | 'md';
  }
>(({ className, variant = 'primary', loading, size = 'md', children, disabled, ...props }, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    className={cn(
      'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-medium transition-colors motion-reduce:transition-none disabled:opacity-50',
      variant === 'primary'
        ? 'bg-accent text-white hover:bg-accent/90'
        : variant === 'secondary'
          ? 'border border-line bg-white text-ink hover:bg-page'
          : variant === 'danger'
            ? 'bg-danger text-white hover:bg-danger/90'
            : 'text-muted hover:bg-page hover:text-ink',
      size === 'sm' && 'px-3 text-xs',
      className,
    )}
    {...props}
  >
    {loading && <LoaderCircle size={16} className="animate-spin" />}
    {children}
  </button>
));
export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => (
    <Button ref={ref} variant="ghost" className={cn('min-w-11 px-2', className)} {...props} />
  ),
);
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full min-w-0 rounded-control border border-line bg-white px-3 text-sm placeholder:text-muted/70 disabled:bg-page',
        className,
      )}
      {...props}
    />
  ),
);
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn('min-h-24 w-full rounded-control border border-line bg-white p-3 text-sm', className)}
      {...props}
    />
  ),
);
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-11 w-full min-w-0 rounded-control border border-line bg-white px-3 text-sm',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>((props, ref) => (
  <input ref={ref} type="checkbox" className="size-4 accent-accent" {...props} />
));
export const DateInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>((props, ref) => (
  <Input ref={ref} type="date" {...props} />
));
export const MoneyInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  (props, ref) => <Input ref={ref} inputMode="decimal" {...props} />,
);
export const MileageInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  (props, ref) => <Input ref={ref} type="number" min="0" step="1" {...props} />,
);
export function Field({
  label,
  error,
  children,
  htmlFor,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${htmlFor}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'blue' | 'green' | 'amber' | 'red';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium',
        tone === 'blue'
          ? 'bg-accent/8 text-accent'
          : tone === 'green'
            ? 'bg-success/8 text-success'
            : tone === 'amber'
              ? 'bg-amber-50 text-warn'
              : tone === 'red'
                ? 'bg-red-50 text-danger'
                : 'bg-page text-muted',
      )}
    >
      {children}
    </span>
  );
}
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-panel border border-line bg-white', className)}>{children}</div>;
}
export function Skeleton() {
  return (
    <div aria-label="Загрузка" className="space-y-5 animate-pulse motion-reduce:animate-none">
      <div className="h-8 w-48 rounded bg-line" />
      <div className="h-64 rounded-panel bg-line/60" />
      <div className="h-20 rounded-panel bg-line/60" />
    </div>
  );
}
export function EmptyState({
  title = 'История пока пустая',
  text = 'Добавьте первую запись об обслуживании, ремонте или пробеге.',
  action,
}: {
  title?: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-5 py-14 text-center">
      <CarFront size={32} className="mb-4 text-muted/60" />
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="max-w-md text-sm leading-6 text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
export function ErrorState({
  message = 'Не удалось загрузить данные',
  retry,
}: {
  message?: string;
  retry?: () => void;
}) {
  return (
    <Panel className="p-6">
      <div role="alert" className="flex items-center gap-3 text-danger">
        <AlertCircle size={18} />
        {message}
      </div>
      {retry && (
        <Button variant="secondary" onClick={retry} className="mt-4">
          Повторить
        </Button>
      )}
    </Panel>
  );
}
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  dirty = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  dirty?: boolean;
}) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(v) => {
        if (!v && dirty && !window.confirm('Закрыть форму? Несохранённые изменения будут потеряны.')) return;
        onOpenChange(v);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/35" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-xl sm:max-w-[540px]">
          <div className="flex items-start justify-between border-b border-line p-6">
            <div>
              <DialogPrimitive.Title className="text-xl font-semibold tracking-tight">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-2 text-xs leading-5 text-muted">
                {description ?? 'Заполните данные. Они сохранятся в истории автомобиля.'}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton aria-label="Закрыть форму">
                <X size={20} />
              </IconButton>
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
export const Dialog = Drawer;
export function DropdownMenu({
  label,
  children,
  items,
}: {
  label: ReactNode;
  children?: ReactNode;
  items: { label: string; action: () => void; icon?: ReactNode }[];
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        {children ?? (
          <Button>
            {label}
            <ChevronDown size={15} />
          </Button>
        )}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          sideOffset={8}
          align="end"
          className="z-50 min-w-52 rounded-panel border border-line bg-white p-1.5 shadow-lg"
        >
          {items.map((i, k) => (
            <Dropdown.Item
              key={k}
              onSelect={i.action}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-3 text-sm outline-none focus:bg-page"
            >
              {i.icon}
              {i.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content className="z-50 rounded bg-ink px-3 py-2 text-xs text-white">
            {label}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
export function Pagination({
  hasMore,
  load,
  loading,
}: {
  hasMore: boolean;
  load: () => void;
  loading?: boolean;
}) {
  return hasMore ? (
    <div className="flex justify-center p-5">
      <Button variant="secondary" onClick={load} loading={loading}>
        Показать ещё <ArrowRight size={15} />
      </Button>
    </div>
  ) : null;
}
export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      role="status"
      className="fixed bottom-24 left-1/2 z-60 flex max-w-[90vw] -translate-x-1/2 items-center gap-4 rounded-panel bg-ink px-5 py-3 text-sm text-white shadow-lg lg:bottom-6"
    >
      {message}
      <button aria-label="Закрыть уведомление" className="min-h-11 min-w-11" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}
export function useToast() {
  const [message, set] = useState('');
  return {
    toast: (v: string) => set(v),
    node: message ? <Toast message={message} onClose={() => set('')} /> : null,
  };
}
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-line" role="tablist">
      {items.map((i) => (
        <button
          key={i.id}
          role="tab"
          aria-selected={value === i.id}
          className={cn(
            'min-h-11 shrink-0 border-b-2 px-4 text-sm',
            value === i.id ? 'border-accent text-accent' : 'border-transparent text-muted',
          )}
          onClick={() => onChange(i.id)}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

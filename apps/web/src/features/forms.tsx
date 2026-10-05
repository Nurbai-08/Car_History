import { useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { carSchema, eventSchema, reminderSchema, currencies, categories } from '@carhistory/validation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Trash2, UploadCloud, Check, Info, X } from 'lucide-react';
import Decimal from 'decimal.js';
import { api, errorMessage, get, queryClient } from '@/shared/api';
import { Button, Checkbox, Drawer, Field, Input, Select, Textarea } from '@/shared/ui';
import { isoToday, labels, money } from '@/shared/lib';
import type { Car, HistoryEvent } from '@/entities';
const refreshData = () => queryClient.invalidateQueries();
export function CarForm({ onClose, onSaved }: { onClose: () => void; onSaved: (car: Car) => void }) {
  const [step, setStep] = useState(1);
  const form = useForm<any>({
    resolver: zodResolver(carSchema),
    defaultValues: {
      brand: '',
      model: '',
      year: new Date().getFullYear(),
      currency: 'KGS',
      odometerKm: 0,
      date: isoToday(),
    },
  });
  const m = useMutation({
    mutationFn: (data: any) => api.post('/cars', data).then((r) => r.data),
    onSuccess: (c) => {
      refreshData();
      onSaved(c);
    },
  });
  const {
    register,
    formState: { errors, isDirty },
  } = form;
  const field = (name: string, label: string, type = 'text', numeric = false) => (
    <Field label={label} htmlFor={name} error={errors[name]?.message as string}>
      <Input
        id={name}
        type={type}
        {...register(name, { ...(numeric ? { valueAsNumber: true } : ['purchaseDate','purchasePrice'].includes(name)?{setValueAs:(v:string)=>v||undefined}:{}) })}
        aria-invalid={!!errors[name]}
        aria-describedby={`${name}-error`}
      />
    </Field>
  );
  return (
    <Drawer
      open
      onOpenChange={onClose}
      title="Добавить автомобиль"
      description={`Шаг ${step} из 2 · ${step === 1 ? 'Основные сведения' : 'Пробег и дополнительные данные'}`}
      dirty={isDirty}
    >
      <form
        onSubmit={form.handleSubmit((d) => {
          if (step === 1) {
            setStep(2);
            return;
          }
          m.mutate(d);
        })}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {step === 1 ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                {field('brand', 'Марка')}
                {field('model', 'Модель')}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {field('year', 'Год выпуска', 'number', true)}
                <Field label="Валюта" htmlFor="currency">
                  <Select id="currency" {...register('currency')}>
                    {currencies.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <p className="rounded-control bg-page p-4 text-xs leading-5 text-muted">
                Ваша история начнётся с первого показания одометра. VIN и остальные сведения можно добавить
                сразу или позже.
              </p>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                {field('odometerKm', 'Одометр, км', 'number', true)}
                {field('date', 'Дата показания', 'date')}
              </div>
              {field('vin', 'VIN (необязательно)')}
              {field('licensePlate', 'Государственный номер (необязательно)')}
              <div className="grid grid-cols-2 gap-4">
                {field('engineType', 'Двигатель')}
                {field('transmission', 'Коробка передач')}
              </div>
              {field('color', 'Цвет')}
              <div className="grid grid-cols-2 gap-4">{field('purchaseDate','Дата покупки','date')}{field('purchasePrice','Цена покупки')}</div>
              <Field label="Примечание" htmlFor="car-note">
                <Textarea id="car-note" {...register('note')} />
              </Field>
            </>
          )}
          {m.isError && (
            <p role="alert" className="text-sm text-danger">
              {errorMessage(m.error)}
            </p>
          )}
          {Object.keys(errors).length > 0 && (
            <p role="alert" className="text-xs text-danger">
              Проверьте поля: {Object.keys(errors).join(', ')}
            </p>
          )}
        </div>
        <div className="flex justify-between border-t border-line p-6">
          <Button variant="secondary" type="button" onClick={() => (step === 1 ? onClose() : setStep(1))}>
            {step === 1 ? 'Отмена' : 'Назад'}
          </Button>
          {step === 1 ? (
            <Button
              key="next"
              type="button"
              onClick={async (e) => {
                e.preventDefault();
                if (await form.trigger(['brand', 'model', 'year', 'currency'])) setStep(2);
              }}
            >
              Продолжить
            </Button>
          ) : (
            <Button key="save" type="submit" loading={m.isPending}>
              Добавить автомобиль
            </Button>
          )}
        </div>
      </form>
    </Drawer>
  );
}
export function FileUploader({
  carId,
  files,
  onChange,
  photo = false,
  avatar = false,
}: {
  carId?: string;
  avatar?: boolean;
  files: { id: string; name: string }[];
  onChange: (files: { id: string; name: string }[]) => void;
  photo?: boolean;
}) {
  const [progress, setProgress] = useState<number | null>(null),
    [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  async function upload(file: File) {
    setError('');
    if (file.size > 15 * 1024 * 1024) {
      setError('Максимальный размер — 15 МБ');
      return;
    }
    if (files.length >= 10) {
      setError('Не более 10 файлов');
      return;
    }
    const body = new FormData();
    if(carId) body.append('carId', carId);
    if(avatar) body.append('avatar', 'true');
    body.append('file', file);
    body.append('photo', String(photo));
    controller.current = new AbortController();
    setProgress(0);
    try {
      const result = await api.post('/files', body, {
        signal: controller.current.signal,
        onUploadProgress: (e) => setProgress(Math.round((e.loaded / (e.total ?? file.size)) * 100)),
      });
      onChange([...files, result.data]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <div className="space-y-3">
      <input
        ref={input}
        type="file"
        aria-label={photo ? 'Загрузить фото автомобиля' : 'Добавить файл'}
        accept={photo ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf'}
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.[0]) upload(e.target.files[0]);
        }}
      />
      <button
        type="button"
        disabled={progress !== null}
        onClick={() => input.current?.click()}
        className="flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-control border border-dashed border-line p-4 hover:bg-page"
      >
        <UploadCloud size={20} className="text-muted" />
        <span className="text-xs font-medium">
          {progress === null
            ? 'Выбрать файл'
            : progress < 100
              ? `Загрузка ${progress}%`
              : 'Проверка и сохранение…'}
        </span>
        <span className="text-[11px] text-muted">JPEG, PNG, WebP{!photo ? ' или PDF' : ''} · до 15 МБ</span>
      </button>
      {progress !== null && (
        <Button variant="ghost" type="button" onClick={() => controller.current?.abort()}>
          Отменить загрузку
        </Button>
      )}
      {files.map((f) => (
        <div key={f.id} className="flex min-w-0 items-center gap-2 text-xs">
          <Check size={14} className="shrink-0 text-success" />
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          <button
            type="button"
            className="min-h-11 min-w-11"
            aria-label={`Убрать ${f.name}`}
            onClick={() => onChange(files.filter((v) => v.id !== f.id))}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
export function EventForm({
  car,
  kind,
  onClose,
  existing,
}: {
  car: Car;
  kind: string;
  onClose: () => void;
  existing?: HistoryEvent;
}) {
  const defaults = {
    kind,
    title: '',
    date: isoToday(),
    description: '',
    currency: car.currency,
    odometerKm: car.latestMileage?.odometerKm ?? 0,
    laborCost: '0',
    extraCost: '0',
    amount: '0',
    parts: [],
    fileIds: [],
    category: 'other',
    changeType: 'reading',
    confirmed: false,
    severity: 'minor',
    insuranceCase: false,
    estimatedDamage: '0',
    documentType: 'other',
    transferAllowed: false,
    ...(existing
      ? {
          ...existing,
          ...existing.data,
          date: existing.date.slice(0, 10),
          odometerKm: existing.odometerKm ?? undefined,
          serviceCenterId: existing.serviceCenter?.id,
          relatedEventId:(existing as any).relatedEventId??undefined,
          fileStages:Object.fromEntries(existing.files.map((f:any)=>[f.id,f.stage??'document'])),
          parts: existing.parts.map(({ id: _id, ...p }) =>
            Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null).map(([k,v])=>[k,k==='warrantyUntil'&&typeof v==='string'?v.slice(0,10):v])),
          ),
          fileIds: existing.files.map((f) => f.id),
        }
      : {}),
  };
  const clean: any = {};
  for (const k of [
    'kind',
    'title',
    'date',
    'description',
    'currency',
    'odometerKm',
    'laborCost',
    'extraCost',
    'amount',
    'parts',
    'fileIds',
    'category',
    'changeType',
    'confirmed',
    'reason',
    'severity',
    'zones',
    'insuranceCase',
    'estimatedDamage',
    'documentType',
    'expiresAt',
    'transferAllowed',
    'nextKm',
    'nextMonths',
    'version',
    'serviceCenterId',
    'relatedEventId',
    'fileStages',
  ])
    if ((defaults as any)[k] !== undefined) clean[k] = (defaults as any)[k];
  const form = useForm<any>({ resolver: zodResolver(eventSchema), defaultValues: clean });
  const {
    register,
    control,
    watch,
    formState: { errors, isDirty },
  } = form;
  const parts = useFieldArray({ control, name: 'parts' });
  const [files, setFiles] = useState(existing?.files ?? []);
  const key = useRef(crypto.randomUUID());
  const service = ['maintenance', 'repair'].includes(kind);
  const [serverError, setServerError] = useState('');
  const related=useQuery({queryKey:['related-events',car.id],queryFn:()=>get(`/cars/${car.id}/history?limit=100`),enabled:['document','repair','expense'].includes(kind)});
  const centers = useQuery({
    queryKey: ['service-centers'],
    queryFn: () => get('/service-centers'),
    enabled: service,
  });
  const mutation = useMutation({
    mutationFn: (data: any) =>
      existing
        ? api.patch(`/events/${existing.id}`, data)
        : api.post(`/cars/${car.id}/events`, data, { headers: { 'Idempotency-Key': key.current } }),
    onSuccess: () => {
      refreshData();
      onClose();
    },
    onError: (e: any) => {
      setServerError(errorMessage(e));
      const fields = e.response?.data?.fieldErrors;
      for (const name in fields) form.setError(name, { message: fields[name][0] });
    },
  });
  const values = watch();
  let total = '0';
  try {
    total = service
      ? (values.parts ?? [])
          .reduce(
            (s: Decimal, p: any) => s.plus(new Decimal(p.quantity || 0).times(p.unitPrice || 0)),
            new Decimal(values.laborCost || 0).plus(values.extraCost || 0),
          )
          .toFixed(2)
      : values.amount;
  } catch {
    /* Intermediate form values are allowed. */
  }
  const field = (name: string, label: string, type = 'text', optional = false) => (
    <Field htmlFor={name} label={label} error={errors[name]?.message as string}>
      <Input
        id={name}
        type={type}
        {...register(name, {
          ...(type === 'number'
            ? { setValueAs: (v) => (v === '' ? undefined : Number(v)) }
            : optional
              ? { setValueAs: (v) => (v === '' ? undefined : v) }
              : {}),
        })}
        aria-invalid={!!errors[name]}
        aria-describedby={`${name}-error`}
      />
    </Field>
  );
  return (
    <Drawer
      open
      onOpenChange={onClose}
      title={existing ? 'Изменить запись' : `Добавить: ${labels[kind]?.toLowerCase()}`}
      dirty={isDirty}
    >
      <form
        onSubmit={form.handleSubmit((d) => {
          setServerError('');
          mutation.mutate(d);
        })}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {field('title', 'Название')}
          <div className="grid grid-cols-2 gap-4">
            {field('date', 'Дата', 'date')}
            {field('odometerKm', 'Одометр, км', 'number', true)}
          </div>
          <Field label="Описание" htmlFor="description">
            <Textarea id="description" {...register('description')} />
          </Field>
          {service && (
            <>
              <Field label="СТО" htmlFor="serviceCenterId">
                <Select
                  id="serviceCenterId"
                  {...register('serviceCenterId', { setValueAs: (v) => v || undefined })}
                >
                  <option value="">Не указано</option>
                  {centers.data?.items.map((s: any) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-center justify-between border-t border-line pt-5">
                <h3 className="font-semibold">Детали и материалы</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    parts.append({
                      name: '',
                      brand: '',
                      article: '',
                      quantity: '1',
                      unit: 'шт',
                      unitPrice: '0',
                    })
                  }
                >
                  <Plus size={16} />
                  Добавить
                </Button>
              </div>
              {parts.fields.map((p, i) => (
                <div key={p.id} className="space-y-3 rounded-control border border-line bg-page/50 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">Деталь {i + 1}</span>
                    <button
                      type="button"
                      className="min-h-11 min-w-11 text-muted"
                      aria-label={`Удалить деталь ${i + 1}`}
                      onClick={() => parts.remove(i)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {field(`parts.${i}.name`, 'Название детали')}
                  <div className="grid grid-cols-2 gap-3">
                    {field(`parts.${i}.brand`, 'Бренд')}
                    {field(`parts.${i}.article`, 'Артикул')}
                    {field(`parts.${i}.quantity`, 'Количество')}
                    {field(`parts.${i}.unitPrice`, 'Цена за единицу')}
                    {field(`parts.${i}.unit`, 'Единица')}
                    {field(`parts.${i}.position`, 'Позиция установки', 'text', true)}
                    {field(`parts.${i}.warrantyUntil`, 'Гарантия до', 'date', true)}
                    {field(`parts.${i}.warrantyKm`, 'Гарантия, км', 'number', true)}
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-4">
                {field('laborCost', 'Стоимость работы')}
                {field('extraCost', 'Прочие расходы')}
              </div>
            </>
          )}
          {kind === 'expense' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                {field('amount', 'Сумма')}
                <Field label="Категория" htmlFor="category">
                  <Select id="category" {...register('category')}>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {labels[c]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </>
          )}
          {(service || kind === 'expense' || kind === 'accident') && (
            <Field label="Валюта" htmlFor="event-currency">
              <Select id="event-currency" {...register('currency')}>
                {currencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          )}
          {['document','repair','expense'].includes(kind)&&<Field label="Связанная работа или ДТП" htmlFor="relatedEventId"><Select id="relatedEventId" {...register('relatedEventId',{setValueAs:v=>v||undefined})}><option value="">Без связи</option>{related.data?.items.filter((e:any)=>['accident','maintenance','repair'].includes(e.kind)&&e.id!==existing?.id).map((e:any)=><option value={e.id} key={e.id}>{e.title}</option>)}</Select></Field>}
          {kind === 'accident' && (
            <>
              <Field label="Тяжесть повреждений" htmlFor="severity">
                <Select id="severity" {...register('severity')}>
                  <option value="minor">Незначительное</option>
                  <option value="moderate">Среднее</option>
                  <option value="severe">Серьёзное</option>
                </Select>
              </Field>
              {field('estimatedDamage', 'Оценка ущерба')}
              <Field label="Повреждённые зоны (через запятую)" htmlFor="zones"><Input id="zones" defaultValue={values.zones?.join(', ')??''} onChange={e=>form.setValue('zones',e.target.value.split(',').map(v=>v.trim()).filter(Boolean),{shouldDirty:true})}/></Field>
              <label className="flex min-h-11 items-center gap-3">
                <Checkbox {...register('insuranceCase')} />
                Страховой случай
              </label>
              <p className="text-xs text-muted">
                Оценка ущерба не включается в расходы. Фактический ремонт сохраните отдельной записью.
              </p>
            </>
          )}
          {kind === 'document' && (
            <>
              <Field label="Тип документа" htmlFor="documentType">
                <Select id="documentType" {...register('documentType')}>
                  {Object.entries({
                    insurance: 'Страхование',
                    inspection: 'Техосмотр',
                    receipt: 'Чек',
                    service: 'Заказ-наряд',
                    warranty: 'Гарантия',
                    contract: 'Договор',
                    other: 'Другое',
                  }).map(([v, l]) => (
                    <option value={v} key={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              {field('expiresAt', 'Действует до', 'date', true)}
              <label className="flex min-h-11 items-center gap-3">
                <Checkbox {...register('transferAllowed')} />
                Передавать документ новому владельцу
              </label>
            </>
          )}
          {service && (
            <div className="space-y-4 border-t border-line pt-5">
              <h3 className="font-semibold">Следующее обслуживание</h3>
              <div className="grid grid-cols-2 gap-4">
                {field('nextKm', 'Через, км', 'number', true)}
                {field('nextMonths', 'Через, месяцев', 'number', true)}
              </div>
              <p className="text-xs text-muted">
                Напоминание сработает по первому из условий. Для старой записи срок может уже наступить.
              </p>
            </div>
          )}
          <details className="rounded-control border border-line p-3">
            <summary className="min-h-8 cursor-pointer text-xs font-medium">
              Коррекция или замена одометра
            </summary>
            <div className="mt-3 space-y-3">
              <Field label="Тип показания" htmlFor="changeType">
                <Select id="changeType" {...register('changeType')}>
                  <option value="reading">Обычное показание</option>
                  <option value="correction">Исправление ошибки</option>
                  <option value="replacement">Замена одометра</option>
                </Select>
              </Field>
              {field('reason', 'Причина изменения', 'text', true)}
              <label className="flex min-h-11 items-center gap-2 text-xs">
                <Checkbox {...register('confirmed')} />
                Подтверждаю отклонение показания
              </label>
            </div>
          </details>
          <div className="space-y-3 border-t border-line pt-5">
            <h3 className="font-semibold">Вложения</h3>
            <p className="text-xs text-muted">Файлы приватны. Публикация настраивается отдельно.</p>
            <FileUploader
              carId={car.id}
              files={files}
              onChange={(f) => {
                setFiles(f as any);
                form.setValue(
                  'fileIds',
                  f.map((x) => x.id),
                  { shouldDirty: true },
                );
              }}
            />
          </div>
          {kind==='accident'&&files.map(f=><Field key={f.id} label={`Этап: ${f.name}`} htmlFor={`stage-${f.id}`}><Select id={`stage-${f.id}`} {...register(`fileStages.${f.id}`)}><option value="document">Документ</option><option value="before">Фото до ремонта</option><option value="after">Фото после ремонта</option></Select></Field>)}
          {service && (
            <div className="rounded-control bg-accent/5 p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">Итого</span>
                <span className="text-xl font-semibold tabular-nums">{money(total, values.currency)}</span>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted">
                Сохранятся работа, детали, показание одометра
                {Number(total) > 0 ? ' и один связанный расход' : ''}.
              </p>
            </div>
          )}
          {(serverError || Object.keys(errors).length > 0) && (
            <div role="alert" className="rounded-control bg-red-50 p-4 text-sm text-danger">
              {serverError || 'Проверьте поля формы. Название детали, количество и цена обязательны.'}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-line p-6">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Сохранить запись
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
export function ReminderForm({ car, onClose, existing }: { car: Car; onClose: () => void; existing?:any }) {
  const f = useForm<any>({
    resolver: zodResolver(reminderSchema),
    defaultValues: existing?{title:existing.title,description:existing.description,soonDays:existing.soonDays,soonKm:existing.soonKm,targetDate:existing.targetDate?.slice(0,10),targetKm:existing.targetKm??undefined,repeatKm:existing.repeatKm??undefined,repeatMonths:existing.repeatMonths??undefined}:{ title: '', description: '', soonDays: 30, soonKm: 1000 },
  });
  const m = useMutation({
    mutationFn: (data: any) => existing?api.patch(`/reminders/${existing.id}`,{version:existing.version,values:data}):api.post(`/cars/${car.id}/reminders`, data),
    onSuccess: () => {
      refreshData();
      onClose();
    },
  });
  return (
    <Drawer open onOpenChange={onClose} title="Новое напоминание" dirty={f.formState.isDirty}>
      <form onSubmit={f.handleSubmit((d) => m.mutate(d))} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {[
            ['title', 'Название', 'text'],
            ['targetDate', 'Целевая дата', 'date'],
            ['targetKm', 'Целевой одометр, км', 'number'],
            ['repeatKm', 'Повторять через, км', 'number'],
            ['repeatMonths', 'Повторять через, месяцев', 'number'],
            ['soonDays','Предупреждать за, дней','number'],
            ['soonKm','Предупреждать за, км','number'],
          ].map(([name, label, type]) => (
            <Field
              key={name}
              label={label}
              htmlFor={name}
              error={f.formState.errors[name]?.message as string}
            >
              <Input
                id={name}
                type={type}
                {...f.register(name, {
                  setValueAs: (v) => (v === '' ? undefined : type === 'number' ? Number(v) : v),
                })}
              />
            </Field>
          ))}
          <p className="flex gap-2 rounded-control bg-page p-4 text-xs leading-5 text-muted">
            <Info size={18} className="shrink-0" />
            Достаточно даты или пробега. Если указаны оба, напоминание сработает по первому условию.
          </p>
          {(m.isError || Object.keys(f.formState.errors).length > 0) && (
            <p role="alert" className="text-danger">
              {m.isError ? errorMessage(m.error) : 'Укажите название и хотя бы одно условие'}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-line p-6">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button loading={m.isPending}>Создать напоминание</Button>
        </div>
      </form>
    </Drawer>
  );
}
export function EditCarForm({ car, onClose }: { car: Car; onClose: () => void }) {
  const f = useForm<any>({
    defaultValues: {
      brand: car.brand,
      model: car.model,
      year: car.year,
      currency: car.currency,
      engineType: car.engineType ?? '',
      transmission: car.transmission ?? '',
      color: car.color ?? '',
      licensePlate: car.licensePlate ?? '',
      generation: (car as any).generation ?? '',
      horsepower: car.horsepower ?? '',
      engineVolume: car.engineVolume ?? '',
      drivetrain: car.drivetrain ?? '',
      note: (car as any).note ?? '',
    },
  });
  const m = useMutation({
    mutationFn: (data: any) => api.patch(`/cars/${car.id}`, { ...data, version: car.version }),
    onSuccess: () => {
      refreshData();
      onClose();
    },
  });
  return (
    <Drawer open onOpenChange={onClose} title="Данные автомобиля" dirty={f.formState.isDirty}>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={f.handleSubmit((d) => m.mutate(d))}>
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4">
            {[
              ['brand', 'Марка'],
              ['model', 'Модель'],
              ['year', 'Год выпуска'],
              ['licensePlate', 'Госномер'],
              ['generation', 'Поколение'],
              ['engineType', 'Тип двигателя'],
              ['engineVolume', 'Объём, л'],
              ['horsepower', 'Мощность, л.с.'],
              ['transmission', 'Коробка передач'],
              ['drivetrain', 'Привод'],
              ['color', 'Цвет'],
            ].map(([name, label]) => (
              <Field key={name} label={label} htmlFor={`edit-${name}`}>
                <Input
                  id={`edit-${name}`}
                  type={['year', 'horsepower'].includes(name) ? 'number' : 'text'}
                  {...f.register(name, {
                    setValueAs: (v) =>
                      v === '' ? undefined : ['year', 'horsepower'].includes(name) ? Number(v) : v,
                  })}
                />
              </Field>
            ))}
          </div>
          <Field label={`VIN (сейчас ${car.vin ?? 'не указан'})`} htmlFor="edit-vin">
            <Input
              id="edit-vin"
              placeholder="Оставьте пустым, чтобы сохранить текущий"
              {...f.register('vin', { setValueAs: (v) => (v === '' ? undefined : v) })}
            />
          </Field>
          <Field label="Валюта" htmlFor="edit-currency">
            <Select id="edit-currency" {...f.register('currency')}>
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Примечание" htmlFor="edit-note">
            <Textarea id="edit-note" {...f.register('note')} />
          </Field>
          {m.isError && (
            <p role="alert" className="text-danger">
              {errorMessage(m.error)}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-line p-6">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button loading={m.isPending}>Сохранить</Button>
        </div>
      </form>
    </Drawer>
  );
}

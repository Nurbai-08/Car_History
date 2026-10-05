import { useQuery } from '@tanstack/react-query';
import { CarFront } from 'lucide-react';
import { get } from '@/shared/api';
import { cn } from '@/shared/lib';
export function CarPhoto({ id, name, className }: { id?: string; name: string; className?: string }) {
  const query = useQuery({
    queryKey: ['photo', id],
    queryFn: () => get(`/files/${id}/download`),
    enabled: !!id,
    staleTime: 240000,
  });
  return (
    <div
      className={cn('flex aspect-[16/9] items-center justify-center overflow-hidden bg-[#ECEDEC]', className)}
    >
      {query.data ? (
        <img src={query.data.url} alt={name} className="size-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-3 text-muted/60">
          <CarFront size={48} strokeWidth={1} />
          <span className="text-[10px] uppercase tracking-[2px]">{name}</span>
        </div>
      )}
    </div>
  );
}

import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { EmptyState } from '@/components/alfred/states';

export default function NotFound() {
  return (
    <div className="w-full max-w-[640px] px-4 py-10 sm:px-6 lg:px-9">
      <EmptyState icon={<SearchX size={26} aria-hidden="true" />} title="Não encontrado" description="Este item não existe ou você não tem acesso a ele." action={<Link href="/alfred" className="inline-flex h-10 items-center rounded-lg border border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-hover">Voltar ao chat</Link>} />
    </div>
  );
}

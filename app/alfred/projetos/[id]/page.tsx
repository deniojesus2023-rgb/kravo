import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { ProjectTabs } from '@/components/alfred/ProjectTabs';
import { getProject } from '@/lib/alfred/data';

export const metadata: Metadata = { title: 'Projeto' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const project = await getProject((await params).id);
  if (!project) notFound();
  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <Link href="/alfred/projetos" className="inline-flex w-fit items-center gap-1 text-[13px] text-fg-muted hover:text-fg"><ChevronLeft size={15} aria-hidden="true" />Projetos</Link>
      <h1 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">{project.name}</h1>
      <ProjectTabs project={project} />
    </div>
  );
}

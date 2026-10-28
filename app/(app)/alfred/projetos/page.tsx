import type { Metadata } from 'next';
import { FolderKanban, Plus } from 'lucide-react';
import { ProjectCard } from '@/components/alfred/ProjectCard';
import { EmptyState, PrimaryButton, PageHeader } from '@/components/alfred/states';
import { capabilities, listProjects } from '@/lib/alfred/data';

export const metadata: Metadata = { title: 'Projetos' };

export default async function Page() {
  const projects = await listProjects();
  return (
    <div className="flex w-full max-w-[1140px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
      <PageHeader title="Projetos" subtitle="Organize suas estratégias e mantenha o contexto das decisões." action={<PrimaryButton disabled={!capabilities.projects} reason="O armazenamento de projetos ainda não está conectado."><Plus size={16} aria-hidden="true" />Novo projeto</PrimaryButton>} />
      {projects.length === 0 ? (
        <EmptyState icon={<FolderKanban size={26} aria-hidden="true" />} title="Nenhum projeto ainda" description="Projetos reúnem a oferta, o público, o preço e o objetivo de cada negócio, para o Alfred analisar com o contexto certo." note="A criação de projetos ainda não está conectada." />
      ) : (
        <ul aria-label="Projetos" className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">{projects.map((p) => <ProjectCard key={p.id} project={p} />)}</ul>
      )}
    </div>
  );
}

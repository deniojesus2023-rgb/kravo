import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, P, Section, UL } from '@/components/legal/Legal';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = { title: 'Exclusão de dados' };

export default function DataDeletionPage() {
  return (
    <LegalPage title="Exclusão de dados">
      <P>
        Você pode pedir a exclusão dos seus dados da kavro a qualquer momento, inclusive os que vieram do Facebook e do
        Meta Ads.
      </P>

      <Section title="Como pedir">
        <UL>
          <li>
            Envie um e-mail para {LEGAL.email} com o assunto "Exclusão de dados", a partir do e-mail cadastrado na sua
            conta kavro.
          </li>
          <li>Confirmaremos o pedido e verificaremos que ele vem do titular da conta.</li>
          <li>
            Excluímos os dados em até {LEGAL.prazoExclusaoDias} dias e avisamos você quando terminar. O pedido é atendido
            manualmente.
          </li>
        </UL>
      </Section>

      <Section title="O que é excluído">
        <P>
          A conta e tudo o que está ligado a ela: ofertas, campanhas e métricas lidas do Meta Ads, pedidos importados das
          plataformas de venda, alertas, registros de sincronização e as credenciais de integração (que ficam
          criptografadas). Podemos reter apenas o que a lei exigir, pelo prazo que ela determinar.
        </P>
      </Section>

      <Section title="Remover o acesso do app no Facebook">
        <P>
          Para impedir que a kavro leia novos dados do Meta Ads, remova o app no Facebook: acesse Configurações e
          privacidade, depois Configurações, depois Integrações comerciais, escolha o app KRAVO e clique em Remover. Isso
          encerra a autorização; para apagar os dados já guardados, faça o pedido acima.
        </P>
      </Section>

      <P>
        Mais detalhes em{' '}
        <Link href="/privacidade" className="text-fg underline underline-offset-2">Política de privacidade</Link>.
      </P>
    </LegalPage>
  );
}

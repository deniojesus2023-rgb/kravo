import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, P, Section, UL } from '@/components/legal/Legal';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = { title: 'Termos de serviço' };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de serviço">
      <P>
        Ao criar uma conta ou usar a kavro, você concorda com estes termos. Se não concordar, não use o serviço.
      </P>

      <Section title="1. O serviço">
        <P>
          A kavro reúne dados de mídia paga e de vendas para ajudar você a decidir, oferta por oferta, o que escalar,
          manter ou pausar. A kavro lê métricas e envia eventos de conversão; ela não cria, edita nem pausa anúncios.
        </P>
      </Section>

      <Section title="2. Sua conta">
        <UL>
          <li>Você deve ter capacidade legal para contratar e informar dados verdadeiros.</li>
          <li>Você é responsável por manter sua senha em sigilo e por tudo o que ocorrer na sua conta.</li>
          <li>Use apenas contas de anúncios e lojas sobre as quais você tem autorização para conectar.</li>
        </UL>
      </Section>

      <Section title="3. Integrações de terceiros">
        <P>
          Ao conectar o Meta Ads ou uma plataforma de vendas, você também se sujeita aos termos desses serviços. Eles
          podem mudar regras, limites e permissões sem aviso; a kavro não controla essas mudanças e pode ficar
          temporariamente sem dados. Você pode desconectar uma integração quando quiser.
        </P>
      </Section>

      <Section title="4. Indicações e números">
        <P>
          As indicações de Escalar, Manter, Pausar ou Dados insuficientes seguem critérios mostrados na tela e são apoio à
          decisão, não garantia de resultado. A kavro não promete lucro. Os números dependem da qualidade e do atraso dos
          dados de origem; divergências e dados ausentes são exibidos como tal. Dados marcados como "exemplo" não são
          reais.
        </P>
      </Section>

      <Section title="5. Uso aceitável">
        <UL>
          <li>Não tente acessar dados de outras contas, burlar limites ou comprometer a segurança do serviço.</li>
          <li>Não use a kavro para atividades ilegais ou que violem as regras da Meta ou das plataformas de venda.</li>
          <li>Não revenda nem redistribua o serviço sem autorização.</li>
        </UL>
      </Section>

      <Section title="6. Disponibilidade e mudanças">
        <P>
          Buscamos manter o serviço disponível, mas ele pode ter interrupções, manutenções e mudanças de funcionalidades.
          Podemos atualizar estes termos; o uso após a mudança indica concordância.
        </P>
      </Section>

      <Section title="7. Responsabilidade">
        <P>
          Na extensão permitida pela lei, a kavro não responde por decisões de investimento em anúncios tomadas com base
          nas informações exibidas, nem por perdas indiretas ou lucros cessantes. Nada aqui limita responsabilidades que a
          lei não permita limitar.
        </P>
      </Section>

      <Section title="8. Encerramento">
        <P>
          Você pode encerrar sua conta e pedir a exclusão dos dados a qualquer momento (veja{' '}
          <Link href="/exclusao-de-dados" className="text-fg underline underline-offset-2">Exclusão de dados</Link>). Podemos
          suspender contas que violem estes termos.
        </P>
      </Section>

      <Section title="9. Privacidade">
        <P>
          O tratamento de dados pessoais segue a{' '}
          <Link href="/privacidade" className="text-fg underline underline-offset-2">Política de privacidade</Link>.
        </P>
      </Section>

      <Section title="10. Lei aplicável e contato">
        <P>
          Estes termos seguem as leis do Brasil, e fica eleito o foro de {LEGAL.foro}. Dúvidas: {LEGAL.email}. Responsável:{' '}
          {LEGAL.controlador}, {LEGAL.documento}.
        </P>
      </Section>
    </LegalPage>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, P, Section, UL } from '@/components/legal/Legal';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = { title: 'Política de privacidade' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidade">
      <P>
        Esta política explica quais dados a trakfy trata, para quê, com quem compartilha e como você exerce seus direitos
        pela Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018). A trakfy é uma plataforma de gestão, rastreamento e
        análise de ofertas de tráfego pago.
      </P>

      <Section title="1. Quem é o responsável">
        <P>
          {LEGAL.controlador}, inscrito sob {LEGAL.documento}, com endereço em {LEGAL.endereco}. Contato para assuntos de
          privacidade e para o encarregado de dados: {LEGAL.email}.
        </P>
      </Section>

      <Section title="2. Dados que tratamos">
        <UL>
          <li>
            <strong className="text-fg">Conta:</strong> e-mail, senha (guardada somente como hash, nunca em texto) e,
            se você informar, seu nome.
          </li>
          <li>
            <strong className="text-fg">Ofertas que você cadastra:</strong> nome, código, plataforma de vendas, preço e
            link de checkout.
          </li>
          <li>
            <strong className="text-fg">Conversas com o Alfred, se você usar:</strong> o texto das suas mensagens e das
            respostas, guardado na sua conta. Só você as vê, e você pode excluir cada conversa.
          </li>
          <li>
            <strong className="text-fg">Dados do Meta Ads, quando você conecta sua conta:</strong> contas de anúncios que
            você escolhe, campanhas, conjuntos e anúncios, e métricas como gasto, impressões, cliques e compras
            reportadas. Lemos esses dados com a permissão <em>ads_read</em>. A trakfy não cria, edita nem pausa anúncios.
          </li>
          <li>
            <strong className="text-fg">Pedidos das plataformas de venda, quando você conecta:</strong> valor, status
            (aprovado, reembolsado, chargeback), data, parâmetros UTM e identificador do evento. Não guardamos nome,
            e-mail, telefone, CPF ou endereço dos compradores em texto legível. Se você ligar a API de Conversões de uma oferta,
            guardamos apenas versões irreversíveis (hash SHA-256) de e-mail, telefone, nome e cidade, o tempo necessário para o envio.
          </li>
          <li>
            <strong className="text-fg">Credenciais de integração:</strong> o token de acesso do Meta e as credenciais
            das plataformas de venda ficam criptografados e nunca são exibidos no navegador nem registrados em log.
          </li>
          <li>
            <strong className="text-fg">Dados técnicos:</strong> cookies de sessão necessários para manter você
            conectado. Não usamos cookies de publicidade.
          </li>
        </UL>
      </Section>

      <Section title="3. Para que usamos">
        <P>
          Para calcular lucro líquido, ROAS real, CPA e reembolsos por oferta; mostrar indicações de Escalar, Manter ou
          Pausar com os critérios; reconciliar anúncios com pedidos; e manter sua conta segura. Os dados do Meta são
          usados apenas para entregar essas funções a você: não os vendemos, não os usamos para publicidade e não os
          combinamos com dados de outros clientes.
        </P>
      </Section>

      <Section title="4. Bases legais">
        <P>
          Execução do contrato de uso da plataforma (art. 7º, V), legítimo interesse para segurança e prevenção a fraudes
          (art. 7º, IX) e consentimento quando você autoriza a conexão com o Meta Ads ou com uma plataforma de vendas
          (art. 7º, I). Você pode revogar a autorização a qualquer momento.
        </P>
      </Section>

      <Section title="5. Com quem compartilhamos">
        <P>
          Apenas com provedores que operam a infraestrutura em nosso nome, atualmente a Supabase (banco de dados e
          autenticação, região de São Paulo) e a Vercel (hospedagem do aplicativo), e quando a lei exigir. Também
          trocamos dados com a Meta e com as plataformas de venda que você conectar, nos limites da autorização que você
          deu. Não vendemos dados pessoais.
        </P>
        <P>
          Se você usar o Alfred, o texto da conversa é enviado à OpenAI (provedor de IA) para gerar cada resposta, no
          limite do que você escreve. Não enviamos CPF nem dados de compradores. Não usamos o conteúdo para outro fim.
        </P>
        <P>
          Se você ligar a API de Conversões em uma oferta, enviamos à Meta, para o pixel que você indicou, cada venda
          aprovada com valor, moeda, identificador do pedido e dados do comprador em hash (SHA-256). O CPF nunca é
          enviado. O envio vem desligado e só começa depois da sua confirmação; você pode desligar a qualquer momento.
        </P>
      </Section>

      <Section title="6. Por quanto tempo guardamos">
        <P>
          Enquanto sua conta existir. Ao pedir a exclusão, removemos todos os dados da sua conta em até{' '}
          {LEGAL.prazoExclusaoDias} dias, exceto o que a lei nos obrigue a manter.
        </P>
      </Section>

      <Section title="7. Seus direitos">
        <P>
          Você pode pedir confirmação do tratamento, acesso, correção, portabilidade, anonimização, eliminação, informação
          sobre compartilhamento e revogação do consentimento (art. 18 da LGPD). Escreva para {LEGAL.email}. Para excluir
          seus dados, veja <Link href="/exclusao-de-dados" className="text-fg underline underline-offset-2">Exclusão de dados</Link>.
          Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
        </P>
      </Section>

      <Section title="8. Segurança">
        <P>
          Cada conta enxerga somente os próprios dados (isolamento por usuário no banco), as conexões usam HTTPS, e as
          credenciais de integração ficam criptografadas. Nenhum sistema é totalmente imune a falhas; em caso de incidente
          relevante, avisaremos você e a ANPD conforme a lei.
        </P>
      </Section>

      <Section title="9. Mudanças nesta política">
        <P>
          Podemos atualizar este texto. A data no topo mostra a última versão. Mudanças relevantes serão avisadas no
          aplicativo ou por e-mail.
        </P>
      </Section>
    </LegalPage>
  );
}

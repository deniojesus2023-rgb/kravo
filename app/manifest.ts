import type { MetadataRoute } from 'next';

/** Faz da trakfy um app instalável (tela inicial do celular). É o que permite receber notificações no iPhone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'trakfy',
    short_name: 'trakfy',
    description: 'Rastreie. Analise. Decida.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0F1114',
    theme_color: '#0F1114',
    lang: 'pt-BR',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}

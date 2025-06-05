// service-worker.js

const CACHE_NAME = 'diretorapp-cache-v1';
// Adicione aqui os caminhos para os arquivos principais do seu app que você quer cachear.
// Certifique-se de que os caminhos estão corretos em relação à raiz do seu site.
const urlsToCache = [
  '/', // Geralmente o mesmo que index.html
  '/index.html',
  '/admin.html',
  '/manifest.json',
  // Adicione aqui o caminho para um CSS global se tiver, ex: '/css/style.css'
  // Adicione aqui o caminho para um JS global se tiver, ex: '/js/app.js'
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  'https://cdn.tailwindcss.com' // Cache da CDN do Tailwind (pode ser problemático se a CDN tiver CORS restritivo para service workers)
];

// Evento de instalação: abre o cache e adiciona os arquivos principais.
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Cache aberto, adicionando arquivos ao cache:', urlsToCache);
        // É importante que todos os URLs sejam cacheados com sucesso.
        // Se um falhar, a instalação do service worker falha.
        // Para a CDN do Tailwind, se houver problemas de CORS, pode ser necessário remover daqui
        // ou usar uma estratégia diferente para recursos de terceiros.
        return cache.addAll(urlsToCache.map(url => new Request(url, { mode: 'no-cors' })))
          .catch(error => {
            console.error('[Service Worker] Falha ao adicionar arquivos ao cache durante a instalação:', error);
            // Você pode querer que a instalação falhe se arquivos críticos não puderem ser cacheados.
            // Se a CDN do Tailwind falhar, o app ainda pode funcionar online.
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                console.warn('[Service Worker] Possível problema de CORS com recurso de terceiros. Tente acessá-lo online.');
            }
            // Não rejeite a promessa aqui para permitir que o service worker instale mesmo com falha em recursos não críticos/CORS.
            // Se algum arquivo for absolutamente essencial e falhar, você pode querer lançar o erro:
            // throw error;
          });
      })
      .then(() => {
        console.log('[Service Worker] Arquivos cacheados com sucesso. Service Worker instalado.');
        return self.skipWaiting(); // Força o service worker a ativar imediatamente
      })
      .catch(error => {
        console.error('[Service Worker] Erro durante a instalação:', error);
      })
  );
});

// Evento de ativação: limpa caches antigos.
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Ativando...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deletando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Service Worker ativado e caches antigos limpos.');
      return self.clients.claim(); // Permite que o SW controle clientes abertos imediatamente
    })
  );
});

// Evento fetch: serve arquivos do cache se disponíveis, caso contrário, busca na rede.
// Estratégia: Cache first (tenta o cache, depois a rede, e atualiza o cache se buscou da rede)
self.addEventListener('fetch', (event) => {
  // Ignora requisições que não são GET (ex: POST para o Firebase)
  if (event.request.method !== 'GET') {
    return;
  }
  // Ignora requisições para o Firebase Firestore, pois ele tem seu próprio mecanismo offline
  if (event.request.url.includes('firestore.googleapis.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[Service Worker] Servindo do cache:', event.request.url);
          return cachedResponse;
        }

        console.log('[Service Worker] Buscando da rede:', event.request.url);
        return fetch(event.request).then(
          (networkResponse) => {
            // Verifica se recebemos uma resposta válida
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
              // 'basic' para recursos da mesma origem, 'cors' para recursos de terceiros com CORS habilitado.
              // Não cachear respostas de erro ou opacas (no-cors) que não podemos verificar.
              return networkResponse;
            }

            // Clona a resposta porque ela é um stream e só pode ser consumida uma vez.
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                console.log('[Service Worker] Adicionando ao cache da rede:', event.request.url);
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          }
        ).catch(error => {
            console.error('[Service Worker] Erro ao buscar da rede:', error, event.request.url);
            // Você pode retornar uma página offline customizada aqui se desejar
            // return caches.match('/offline.html'); 
        });
      })
  );
});

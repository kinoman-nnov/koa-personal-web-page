let configModule;
try {
  configModule = await import('./services/config.js');
  configModule.validateEnv();
} catch (err) {
  console.error('FATAL: Старт сервера невозможен, ошибка конфигурации:', err.message);
  process.exit(1);
}

import Koa from 'koa';
import { bodyParser } from '@koa/bodyparser';
import session from 'koa-session';
import path from 'path';
import views from '@ladjs/koa-views';
import logger from 'koa-logger';
import serve from 'koa-static';
import koaHelmet from 'koa-helmet';

import { router } from './routes/index.js';
import { errorHandler } from './services/errorHandler.js';

const app = new Koa();
app.proxy = true;

const secret = configModule.getConfig.sessionSecret;

// custom error-handling logic (если отсутствует logger)
// app.on('error', (err, ctx) => {
//   console.error(`[ERROR EVENT] [Status: ${err.status || 500}]:`, err.message, ctx.request.url);
// });

// Глобальный обработчик
app.use(errorHandler());

app.use(koaHelmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "fonts.googleapis.com",
        "cdnjs.cloudflare.com"
      ],
      fontSrc: [
        "'self'",
        "fonts.gstatic.com",
        "cdnjs.cloudflare.com"
      ],
      imgSrc: ["'self'", "data:", "blob:"],
    },
  },
}));

app.use(logger());
app.use(bodyParser());

app.keys = [secret];

const SESSION_CONFIG = {
  key: 'koa.sess',
  maxAge: 86400000, // 24 часа
  autoCommit: true,
  overwrite: true,
  httpOnly: true,  // Защита от кражи кук через JS (XSS)
  signed: true,    // Использовать app.keys для подписи куки
  secure: process.env.NODE_ENV === 'production', // true только на продакшене (HTTPS)
  sameSite: 'lax'
};

// Подключаем сессии строго ДО роутеров
app.use(session(SESSION_CONFIG, app));

app.use(async (ctx, next) => {
  // Инициализируем хранилище в сессии, если его еще нет
  if (!ctx.session.flash) {
    ctx.session.flash = {};
  }
  // Создаем объект для чтения сообщений, которые пришли из предыдущего запроса
  const prevFlash = ctx.session.flash;
  // Очищаем сессию для следующего запроса (чтобы сообщения удалялись после показа)
  ctx.session.flash = {};
  // Метод для записи нового сообщения (для следующего редиректа)
  ctx.flash = {
    set: (key, value) => {
      ctx.session.flash[key] = value;
    },
    get: (key) => {
      return prevFlash[key] || null;
    }
  };
  // Прокидываем старые сообщения во все шаблоны ctx.render
  ctx.state.flashSuccess = ctx.flash.get('success');
  ctx.state.flashError = ctx.flash.get('error');

  await next();
});

const viewsPath = path.join(process.cwd(), 'views');
app.use(
  views(viewsPath, {
    extension: 'pug'
  })
);

const publicPath = path.join(process.cwd(), 'public');
app.use(serve(publicPath));

app.use(router.routes());
app.use(router.allowedMethods());

app.listen(3030);
import fsp from 'fs/promises';
import path from 'path';
import Router from '@koa/router';
import ratelimit from 'koa-ratelimit';

import { hashPassword } from '../services/password.js';

const loginRoute = new Router();

const USER_PATH = path.join(process.cwd(), './database/user.json');

const loginLimiter = ratelimit({
  driver: 'memory',
  db: new Map(),
  duration: 60000 * 5, // 5 минут
  max: 5,              // не более 5 попыток ввода пароля с одного IP
  id: (ctx) => ctx.ip,
  errorMessage: 'Слишком много неудачных попыток входа. Доступ заблокирован на 5 минут.',
  disableHeader: false,
});

loginRoute.use(async (ctx, next) => {
  if (ctx.session && ctx.session.user) {
    ctx.redirect('/admin');
  }
  await next();
});

loginRoute.get('/', async (ctx, next) => {
  await ctx.render('pages/login', { title: 'SigIn page' });
});

loginRoute.post('/', loginLimiter, async (ctx, next) => {
  try {
    const { email, password } = ctx.request.body;

    if (!email || !password) ctx.throw(400, "Заполните все поля");

    let user;

    try {
      user = JSON.parse(await fsp.readFile(USER_PATH, 'utf-8'));
    } catch (err) {
      if (err.code === 'ENOENT') ctx.throw(500, 'Ошибка: файл user.json не найден');
      throw (err);
    }

    if (email !== user.email) {
      ctx.status = 401;
      return await ctx.render(
        'pages/login',
        { msglogin: 'Неверный email или пароль', email }
      );
    }

    const hash = await hashPassword(password, user.salt);

    if (hash !== user.hash) {
      ctx.status = 401;
      return await ctx.render(
        'pages/login',
        { msglogin: 'Неверный email или пароль', email }
      );
    }

    ctx.session = null; // Очищаем старую сесс
    // пользователь авторизован
    ctx.session.user = {
      id: user.id,
      email: user.email
    }

    ctx.redirect('/admin');

  } catch (err) {
    throw err;
  }
});

export default loginRoute;
import Router from '@koa/router';
import main from './main.js';
import login from './login.js';
import admin from './admin.js';

export const router = new Router();

async function isAuth(ctx, next) {
  if (ctx.session.user) {
    return await next();
  }

  return ctx.redirect('/login');
}

router.use(main.routes()).use(main.allowedMethods());

router.use('/login', login.routes()).use(login.allowedMethods());

router.use('/admin', isAuth, admin.routes()).use(admin.allowedMethods());
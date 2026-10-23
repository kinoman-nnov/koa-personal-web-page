import Router from '@koa/router';
import nodemailer from 'nodemailer';
import ratelimit from 'koa-ratelimit';

import { getConfig } from "../services/config.js";
import { readData } from '../services/storage.js';

const mainRoute = new Router();

const { user, clientId, clientSecret, refreshToken } = getConfig.google;
const { to: emailTo } = getConfig.email;

const transporter = nodemailer.createTransport({
  service: "gmail", // Shortcut for Gmail's SMTP settings
  auth: {
    type: "OAuth2",
    user,
    clientId,
    clientSecret,
    refreshToken,
  }
});

const apiLimiter = ratelimit({
  driver: 'memory',
  db: new Map(),
  duration: 60000, // 1 минута
  max: 15,         // макс. 15 запросов
  id: (ctx) => ctx.ip,
  errorMessage: 'Слишком много запросов. Пожалуйста, подождите минуту.',
  disableHeader: false,
});

mainRoute.get('/', async (ctx) => {
  const data = await readData();
  const { skills, products } = data;

  await ctx.render('pages/index.pug', {
    title: 'Main page',
    products,
    skills
  });
});

mainRoute.post('/api/contact', apiLimiter, async (ctx, next) => {
  const { name, email, message } = ctx.request.body || {};

  if (typeof name !== 'string' || typeof email !== 'string' || typeof message !== 'string') {
    ctx.status = 400;
    ctx.body = {
      msg: 'Некорректный формат данных',
      status: 'Error'
    }
    return;
  }

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    ctx.status = 400;
    ctx.body = {
      msg: 'Заполните все поля формы!',
      status: 'Error'
    }
    return;
  }

  // Базовая валидация формата Email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    ctx.status = 400;
    ctx.body = {
      status: 'Error',
      msg: 'Введите корректный адрес электронной почты!'
    };
    return;
  }

  // Очищаем имя от возможных инъекций перевода строки
  const cleanName = name.replace(/[\r\n\(\)\\]/g, '').slice(0, 100);

  const mailOptions = {
    from: `"${cleanName}" <${user}>`,
    replyTo: email,
    to: emailTo,
    subject: "Сообщение с сайта Koa-personal-web-page",
    text: message.trim().slice(0, 500) + `\n Отправлено от: ${name} <${email}>`
  }

  try {
    await transporter.sendMail(mailOptions);

    ctx.status = 200;
    ctx.body = {
      msg: 'Письмо успешно отправлено!',
      status: 'Ok'
    };

  } catch (err) {
    console.error('[API Contact Error]', err);
    switch (err.code) {
      case "ECONNECTION":
      case "ETIMEDOUT":
        ctx.status = 503;
        ctx.body = {
          msg: `Ошибка сети - повторите попытку позже: ${err.message}`,
          status: 'Error'
        };
        break;
      case "EAUTH":
      case "EENVELOPE":
        if (err.code === "EAUTH") {
          console.error("Authentication failed (OAuth2):", err.message);
        } else {
          console.error("Invalid envelope:", err.message, err.rejected || []);
        }
        ctx.status = 500;
        ctx.body = {
          msg: `При отправке письма произошла ошибка!: ${err.message}`,
          status: 'Error'
        };
        break;
      default:
        throw (err);
    }
  }
});

export default mainRoute;
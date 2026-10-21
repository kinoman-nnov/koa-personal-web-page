export function errorHandler() {
  return async function (ctx, next) {
    try {
      // Пропускаем запрос вглубь приложения (к роутерам)
      await next();
    } catch (err) {
      // Определяем статус-код ошибки (по умолчанию 500)
      ctx.status = err.status || err.statusCode || 500;

      console.error('[GLOBAL ERROR]', err);

      const isProduction = process.env.NODE_ENV === 'production';
      const safeMessage = ctx.status === 500 
        ? 'Внутренняя ошибка сервера. Пожалуйста, повторите попытку позже.' 
        : err.message;

      await ctx.render('error.pug', {
        message: safeMessage,
        status: ctx.status,
        error: isProduction ? { status: ctx.status } : err
      });

      // Генерируем событие для app.on('error'), чтобы сработал системный логгер
      ctx.app.emit('error', err, ctx);
    }
  }
}

export function isFormidableError(err) {
  return (
    err &&
    typeof err === 'object' &&
    typeof err.code === 'number' &&
    err.code >= 1000 &&
    err.code <= 1015 &&
    'httpCode' in err
  );
}
import { koaBody } from 'koa-body';
import os from 'os';

export const parseMultipartForm = async (ctx, next) => {
  const koaBodyParser = koaBody({
    multipart: true,  // парсинг файлов и текста из multipart/form-data

    // Отключаем обычные текстовые формы и обработку JSON-запросов
    urlencoded: false,
    json: false,

    formidable: {
      uploadDir: os.tmpdir(), // Сохраняем во временную директорию ОС, защищенную от исполнения веб-скриптов
      keepExtensions: false, // Отключаем сохранение оригинального расширения, файл запишется как случайная строка
      maxFileSize: 5 * 1024 * 1024, // 5 MB
      maxFieldsSize: 100 * 1024,   // 100 kB
      allowEmptyFiles: true,  // Разрешаем пустые инпуты
      minFileSize: 0, // Сбрасываем минимальный размер в 0, чтобы не вылетала ошибка 1008

      filter: function ({ name, originalFilename, mimetype }) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

        // Пустой инпут пропускаем (для режима редактирования)
        if (!originalFilename || originalFilename.trim() === '') {
          return false;
        }

        if (!allowedTypes.includes(mimetype)) {
          // Записываем кастомное свойство ошибки в объект запроса Koa
          ctx.request.mimetypeValidationError = true; // флаг
          return false; // Файл НЕ запишется на диск
        }
        return true;
      }
    },
    onError(err, ctx) {
      ctx.throw(400, err);
    }
  });
  try {
    await koaBodyParser(ctx, next);
  } catch (err) {
    ctx.state.formidableUploadError = err;
    await next();
  }
}
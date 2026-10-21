import { koaBody } from 'koa-body';
import path from 'path';

export const UPLOAD_DIR = path.join(process.cwd(), './public/assets/img/products');

export const parseMultipartForm = async (ctx) => {

  const koaBodyParser  = koaBody({
    multipart: true,  // парсинг файлов и текста из multipart/form-data
  
    // Отключаем обычные текстовые формы и обработку JSON-запросов
    urlencoded: false,
    json: false,
  
    formidable: {
      uploadDir: UPLOAD_DIR,
      keepExtensions: true,
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
          ctx.request.fileValidationError = true; // флаг
          return false; // Файл НЕ запишется на диск
        }
        return true;
      }
    },
    onError(err, ctx) {
      ctx.throw(400, err);
    }
  });
  // Передаем пустой промис вместо next
  await koaBodyParser(ctx, async () => {});
};
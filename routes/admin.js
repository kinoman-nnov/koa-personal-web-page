import Router from '@koa/router';
import path from 'path';
import crypto from 'crypto';
import { errors as formidableErrors } from 'formidable';

import { readData, writeData, deleteFile } from '../services/storage.js';
import { parseMultipartForm, UPLOAD_DIR } from './middlewares/upload.js';
import { isFormidableError } from '../services/errorHandler.js';

const adminRoute = new Router();

async function getAdminData(ctx, editProductId = null) {
  const data = await readData();

  const { skills, products } = data;

  let editProduct = null;

  if (!!editProductId) {
    editProduct = products.find(p => p.id === editProductId);

    if (!editProduct) ctx.throw(404, 'Редактируемый продукт не найден');
  }

  const age = skills.find(s => s.key === 'age') || { number: 0 };
  const concerts = skills.find(s => s.key === 'concerts') || { number: 0 };
  const cities = skills.find(s => s.key === 'cities') || { number: 0 };
  const years = skills.find(s => s.key === 'years') || { number: 0 };

  const currentSkills = { age, concerts, cities, years };

  return { data, currentSkills, products, editProduct };
}

function validateProduct(ctx, isEdit) {
  if (ctx.request.fileValidationError) {
    return {
      isValid: false,
      errMsg: 'Ошибка: Недопустимый формат файла! Разрешены только JPEG, PNG, WEBP и GIF.'
    };
  }

  const { name, price } = ctx.request.body;
  const newPhoto = ctx.request.files?.photo;

  if (isEdit === false && !newPhoto) {
    return {
      isValid: false,
      errMsg: 'Ошибка: Необходимо загрузить фото товара!'
    }
  }

  if (!name || name.trim() === '') {
    return {
      isValid: false,
      errMsg: 'Ошибка: Введите название товара!'
    }
  }

  const numericPrice = Number(price);
  if (isNaN(numericPrice) || numericPrice <= 0) {
    return {
      isValid: false,
      errMsg: 'Ошибка: Цена должна быть положительным числом!'
    }
  }

  return { isValid: true }
}

function validateSkills(ctx, requiredArr) {
  const incomingData = ctx.request.body;
  for (const field of requiredArr) {
    if (!incomingData[field] || isNaN(incomingData[field]) || Number(incomingData[field]) < 0) {

      return {
        isValid: false,
        errMsg: `Ошибка: введите целое неотрицательное число!`
      }
    }
  }

  return { isValid: true }
}

adminRoute.get('/', async (ctx, next) => {
  try {
    const { currentSkills, products } = await getAdminData();

    const { age, concerts, cities, years } = currentSkills;

    const msgupload = ctx.flash.get('msgupload') || null;
    const msgskill = ctx.flash.get('msgskill') || null;
    const msgdelete = ctx.flash.get('msgdelete') || null;

    await ctx.render('pages/admin', {
      title: 'Admin page',
      products,
      age,
      concerts,
      cities,
      years,
      msgupload,
      msgskill,
      msgdelete
    });
  } catch (err) {
    throw (err);
  }
});

adminRoute.post('/skills', async (ctx, next) => {
  /*
    в переменной age - Возраст начала занятий на скрипке
    в переменной concerts - Концертов отыграл
    в переменной cities - Максимальное число городов в туре
    в переменной years - Лет на сцене в качестве скрипача
  */
  let renderData = { title: 'Admin page' };

  try {
    const incomingData = ctx.request.body;

    const { products } = await getAdminData();

    renderData = {
      ...renderData,
      products,
      skillFormData: incomingData
    };

    // валидация 
    const requiredFields = ['age', 'concerts', 'cities', 'years'];
    const validation = validateSkills(ctx, requiredFields);

    if (!validation.isValid) {
      return await ctx.render('pages/admin', {
        ...renderData,
        msgskillError: validation.errMsg
      });
    }

    const data = await readData();

    const skills = data.skills;

    for (const skill of skills) {
      const key = skill.key;
      if (requiredFields.includes(key)) {
        skill.number = Number(incomingData[key]);
      }
    }

    await writeData(data);

    ctx.flash.set('msgskill', 'Скиллы успешно обновлены!');
    ctx.redirect('/admin');

  } catch (err) {
    console.error('[skills POST] Ошибка', err);

    let userErrorMsg = 'Произошла непредвиденная ошибка!';

    if (err.code === 'ENOENT') userErrorMsg = 'Ошибка: файл data.json не найден!';

    await ctx.render('pages/admin', {
      ...renderData,
      msgskillError: userErrorMsg
    });
  }
});

adminRoute.post('/products/add', async (ctx, next) => {
  /*
    в переменной photo - Картинка товара
    в переменной name - Название товара
    в переменной price - Цена товара
  */
  let renderData = { title: 'Admin page' };

  const { currentSkills, products } = await getAdminData();
  const { age, concerts, cities, years } = currentSkills;

  renderData = {
    ...renderData,
    products,
    age,
    concerts,
    cities,
    years
  }

  try {
    // Парсим поля multipart/form-data и загружаем картинку
    await parseMultipartForm(ctx);
  } catch (err) {
    throw err;
  }

  const incomingData = ctx.request.body;
  const newPic = ctx.request.files?.photo;

  try {
    renderData = {
      ...renderData,
      productFormData: incomingData
    }

    const validation = validateProduct(ctx);
    if (!validation.isValid) {
      if (newPic) {
        const fileName = path.basename(newPic.newFilename);
        const filePath = path.join(UPLOAD_DIR, fileName);

        await deleteFile(filePath);
      }

      // если поля не прошли валидацию, рендерим кастомную ошибку
      return await ctx.render('pages/admin', {
        ...renderData,
        msguploadError: validation.errMsg
      });
    }

    const data = await readData();

    const product = {
      id: crypto.randomUUID(),
      src: `/assets/img/products/${newPic.newFilename}`,
      name: incomingData.name,
      price: Number(incomingData.price)
    }

    data.products.push(product);

    await writeData(data);

    ctx.flash.set('msgupload', 'Товар успешно добавлен!');
    ctx.redirect('/admin');

  } catch (err) {
    console.error('[uploads POST] Ошибка', err);

    let userErrorMsg = 'Произошла непредвиденная ошибка';

    const isSizeError = err.message && err.message.includes('maxFileSize exceeded');

    if (isSizeError) {
      userErrorMsg = 'Ошибка: Файл слишком большой! Максимальный размер — 5 МБ.';
    } else {
      switch (err.code) {
        case 'INVALID_FILE_TYPE':
          userErrorMsg = 'Ошибка: Недопустимый формат файла! Разрешены только JPEG, PNG, WEBP и GIF.';
          break;
        case 'ENOENT':
          userErrorMsg = 'Ошибка: файл данных data.json не найден на сервере.';
          break;
      }
    }

    if (newPic) {
      const fileName = path.basename(newPic.newFilename);
      const filePath = path.join(UPLOAD_DIR, fileName);

      await deleteFile(filePath);
    }

    if (ctx.request.body) {
      renderData.productFormData = {
        name: ctx.request.body.name || '',
        price: ctx.request.body.price || ''
      }
    }

    await ctx.render('pages/admin', {
      ...renderData,
      msguploadError: userErrorMsg
    });
  }
});

// форма для редакирования товара из списка по id
adminRoute.get('/products/:id/edit', async (ctx, next) => {
  let renderData = { title: 'Admin page' };

  try {
    // id не валидирую, так как если он будет пустой, роут не выполнится
    const productId = ctx.request.params.id;

    const { currentSkills, products } = await getAdminData(ctx, productId);
    const { age, concerts, cities, years } = currentSkills;

    renderData = {
      ...renderData,
      products,
      age,
      concerts,
      cities,
      years
    }

    const editProduct = products.find(p => p.id === productId);

    if (!editProduct) {
      console.error(`[Edit GET] Товар не найден: ${productId}`);

      // в случае ошибки рендерим шаблон добавления продукта и передаем в него ошибку
      ctx.status = 404;
      return await ctx.render('pages/admin', {
        ...renderData,
        msguploadError: 'Редактируемый продукт не найден'
      });
    }

    await ctx.render('pages/admin', {
      ...renderData,
      editProduct
    });

  } catch (err) {
    throw err;
  }
});

// редактировать товар по id
adminRoute.post('/products/:id', async (ctx, next) => {
  let renderData = { title: 'Admin page' };
  let editProduct = null;

  try {
    const productId = ctx.request.params.id;

    const { data, currentSkills, products, editProduct: foundProduct } = await getAdminData(ctx, productId);
    editProduct = foundProduct;

    const { age, concerts, cities, years } = currentSkills;

    renderData = {
      ...renderData,
      products,
      age,
      concerts,
      cities,
      years,
      editProduct
    }

    try {
      // Парсим поля multipart/form-data и загружаем картинку
      await parseMultipartForm(ctx);
    } catch (err) {
      if (err.code === formidableErrors.noEmptyFiles) {
        // пропустить ошибку загрузки пустого файла в режиме редактирования
      } else throw err;
    }

    const incomingData = ctx.request.body;
    const newPic = ctx.request.files?.photo;

    const validation = validateProduct(ctx, true);
    if (!validation.isValid) {
      // Если при валидации РЕДАКТИРУЕМОГО файла произошла ошибка, 
      // formidable уже загрузил файл в папку. Его нужно удалить, чтобы не копить мусор.
      if (newPic) {
        const newPicName = path.basename(newPic.newFilename);
        const newPicPath = path.join(UPLOAD_DIR, newPicName);
        await deleteFile(newPicPath);
      }
      // Формируем временный объект для отображения в случае ошибки в форме
      const temporaryEditState = {
        ...editProduct,
        name: incomingData.name,
        price: incomingData.price
      }

      return await ctx.render('pages/admin', {
        ...renderData,
        editProduct: temporaryEditState, // передаем админу то, что он ввел
        msgeditError: validation.errMsg
      });
    }

    // Данные валидны, изменяем объект в памяти 
    const numericPrice = Number(incomingData.price);
    editProduct.name = incomingData.name;
    editProduct.price = numericPrice;

    if (newPic) {
      if (editProduct.src) {
        const fileName = path.basename(editProduct.src);
        const filePath = path.join(UPLOAD_DIR, fileName);

        await deleteFile(filePath);
      }

      editProduct.src = `/assets/img/products/${newPic.newFilename}`;
    }

    await writeData(data);

    ctx.flash.set('msgupload', 'Товар успешно отредактирован!');
    ctx.redirect('/admin');

  } catch (err) {
    console.error('[edit POST] Ошибка', err);

    const reqFile = ctx.request.files?.photo;
    if (reqFile) {
      try {
        const newPicName = path.basename(reqFile.newFilename);
        await deleteFile(path.join(UPLOAD_DIR, newPicName));

      } catch (cleanupErr) {
        console.error('Не удалось удалить временный файл при ошибке:', cleanupErr);
      }
    }

    let userErrorMsg = 'Произошла непредвиденная ошибка';

    if (isFormidableError(err)) {
      switch (err.code) {
        case formidableErrors.biggerThanTotalMaxFileSize:
          userErrorMsg = 'Ошибка: Файл слишком большой! Максимальный размер — 5 МБ.';
          break;
        case formidableErrors.maxFieldsSizeExceeded:
          userErrorMsg = 'Ошибка: Форма содержит слишком много текста! Максимальный размер — 100 кБ.';
          break;
      }
    } else {
      switch (err.code) {
        case 'ENOENT':
          userErrorMsg = 'Ошибка: файл данных data.json не найден на сервере.';
          break;
      }
    }

    if (err.status === 404) userErrorMsg = err.message; // из getAdminData

    const isEditError = !!editProduct;

    if (!!editProduct) {
      const reqBody = ctx.request.body;
      if (reqBody) {
        renderData.editProduct = {
          ...editProduct,
          name: reqBody.name || '',
          price: reqBody.price || ''
        };
      }
    }

    await ctx.render('pages/admin', {
      ...renderData,
      editProduct,
      msgeditError: isEditError ? userErrorMsg : null,
      msguploadError: !isEditError ? userErrorMsg : null
    });
  }
});

adminRoute.post('/products/:id/delete', async (ctx, next) => {
  let renderData = { title: 'Admin page' };

  try {
    const productId = ctx.request.params.id;

    const { data, currentSkills, products, editProduct } = await getAdminData(ctx, productId);
    const { age, concerts, cities, years } = currentSkills;

    renderData = {
      ...renderData,
      products,
      age,
      concerts,
      cities,
      years
    }

    const index = products.findIndex(product => product.id === editProduct.id);

    if (index === -1) {
      ctx.throw(404, 'Товар не найден в списке продуктов');
    }

    // Проверяем, что картинка задана и это не дефолтная заглушка
    if (editProduct.src) {
      const fileName = path.basename(editProduct.src);
      const filePath = path.join(UPLOAD_DIR, fileName);

      await deleteFile(filePath);
    }

    products.splice(index, 1); // удалить 1 элемент начиная с index

    await writeData(data);

    ctx.flash.set('msgdelete', 'Товар успешно удален!');
    ctx.redirect('/admin');

  } catch (err) {
    console.error('[delete POST] Ошибка', err);

    let userErrorMsg = 'Произошла непредвиденная ошибка';

    if (err.code === 'ENOENT') userErrorMsg = 'Ошибка: файл data.json не найден';
    else if (err.status === 404) userErrorMsg = err.message; // из getAdminData

    await ctx.render('pages/admin', {
      ...renderData,
      msgdeleteError: userErrorMsg
    });
  }
});

adminRoute.post('/logout', (ctx, next) => {
  try {
    ctx.session = null;

    ctx.redirect('/login');
  } catch (err) {
    throw err;
  }
});

export default adminRoute;
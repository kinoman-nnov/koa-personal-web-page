import Router from '@koa/router';
import path from 'path';
import crypto from 'crypto';
import { errors as formidableErrors } from 'formidable';

import { readData, writeData, deleteFile, UPLOAD_DIR } from '../services/storage.js';
import { parseMultipartForm } from './middlewares/upload.js';
import { isFormidableError } from '../services/errorHandler.js';
import { isRealImage, saveImageFile } from './middlewares/fileUploadSecurity.js';

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

async function validateProduct(ctx, isEdit = false) {
  if (ctx.request.mimetypeValidationError) {
    return {
      isValid: false,
      errMsg: 'Ошибка: Недопустимый формат файла! Разрешены только JPEG, PNG, WEBP и GIF.'
    };
  }

  const { name, price } = ctx.request.body;
  const tempPhoto = ctx.request.files?.photo;

  if (tempPhoto && tempPhoto.filepath) {
    const isRealTempImage = await isRealImage(tempPhoto.filepath);
    if (!isRealTempImage) {
      return {
        isValid: false,
        errMsg: 'Вредоносный контент: файл маскируется под изображение!'
      }
    }
  }

  if (isEdit === false && (!tempPhoto || !tempPhoto.filepath)) {
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

adminRoute.post('/products/add', parseMultipartForm, async (ctx, next) => {
  /*
    в переменной photo - Картинка товара
    в переменной name - Название товара
    в переменной price - Цена товара
  */
  let renderData = { title: 'Admin page' };

  let incomingData;
  let tempPic;
  let savedFilename;

  try {
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

    incomingData = ctx.request.body;
    tempPic = ctx.request.files?.photo; // Сейчас файл лежит в os.tmpdir() без расширения

    renderData = {
      ...renderData,
      productFormData: incomingData
    }

    const isFormidableUploadError = ctx.state.formidableUploadError;
    if (isFormidableUploadError) {
      throw isFormidableUploadError;
    }

    const validation = await validateProduct(ctx);
    if (!validation.isValid) {
      ctx.throw(422, validation.errMsg, { code: 'FORM_VALIDATION_ERROR' });
    }

    savedFilename = await saveImageFile(tempPic);

    const data = await readData();

    const product = {
      id: crypto.randomUUID(),
      src: `/assets/img/products/${savedFilename}`,
      name: incomingData.name,
      price: Number(incomingData.price)
    }

    data.products.push(product);

    await writeData(data);

    ctx.flash.set('msgupload', 'Товар успешно добавлен!');
    ctx.redirect('/admin');

  } catch (err) {
    console.error('[uploads POST]', err);

    if (savedFilename) { // Ошибка произошла ПОСЛЕ того, как файл был успешно переименован
      const finalFilePath = path.join(UPLOAD_DIR, savedFilename);
      await deleteFile(finalFilePath);
    } else if (tempPic?.filepath) { // Ошибка произошла ДО переименования 
      await deleteFile(tempPic.filepath);
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
        case 'FORM_VALIDATION_ERROR':
          userErrorMsg = err.message;
          break;
        case 'ENOENT':
          userErrorMsg = 'Ошибка: файл данных data.json не найден на сервере.';
          break;
      }
    }

    if (incomingData) {
      renderData.productFormData = {
        name: incomingData.name || '',
        price: incomingData.price || ''
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
adminRoute.post('/products/:id', parseMultipartForm, async (ctx, next) => {
  let renderData = { title: 'Admin page' };
  let editProduct = null;

  let incomingData;
  let tempPic;
  let savedFilename;

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

    incomingData = ctx.request.body;
    tempPic = ctx.request.files?.photo;

    const isFormidableUploadError = ctx.state.formidableUploadError;
    if (isFormidableUploadError) {
      throw isFormidableUploadError;
    }

    const validation = await validateProduct(ctx, true);
    if (!validation.isValid) {
      ctx.throw(422, validation.errMsg, { code: 'FORM_VALIDATION_ERROR' });
    }

    const isNewFileUploaded = tempPic && tempPic.filepath && tempPic.size > 0;
    if (isNewFileUploaded) {
      savedFilename = await saveImageFile(tempPic);
    }

    // Данные валидны, изменяем объект в памяти 
    const numericPrice = Number(incomingData.price);
    editProduct.name = incomingData.name;
    editProduct.price = numericPrice;

    if (savedFilename) {
      if (editProduct.src) {
        const fileName = path.basename(editProduct.src);
        const filePath = path.join(UPLOAD_DIR, fileName);

        await deleteFile(filePath);
      }
      editProduct.src = `/assets/img/products/${savedFilename}`;
    }

    await writeData(data);

    ctx.flash.set('msgupload', 'Товар успешно отредактирован!');
    ctx.redirect('/admin');

  } catch (err) {
    console.error('[edit POST]', err);

    if (savedFilename) { // Ошибка произошла ПОСЛЕ того, как файл был успешно переименован
      const finalFilePath = path.join(UPLOAD_DIR, savedFilename);
      await deleteFile(finalFilePath);
    } else if (tempPic?.filepath) { // Ошибка произошла ДО переименования 
      await deleteFile(tempPic.filepath);
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
        case 'FORM_VALIDATION_ERROR':
          userErrorMsg = err.message;
          break;
        case 'ENOENT':
          userErrorMsg = 'Ошибка: файл данных data.json не найден на сервере.';
          break;
      }
    }

    if (err.status === 404) userErrorMsg = err.message;

    const isEditError = !!editProduct;

    if (!!editProduct) {
      if (incomingData) {
        renderData.editProduct = {
          ...editProduct,
          name: incomingData.name || '',
          price: incomingData.price || ''
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
    else if (err.status === 404) userErrorMsg = err.message;

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
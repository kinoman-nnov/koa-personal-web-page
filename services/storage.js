import fsp from 'fs/promises';
import path from 'path';

const BD = './database/data.json';
const UD = './public/assets/img/products';

const DATA_PATH = path.join(process.cwd(), BD);

export const UPLOAD_DIR = path.join(process.cwd(), UD);

export async function readData() {
  try {
    const rf = await fsp.readFile(DATA_PATH, 'utf-8');
    return JSON.parse(rf);
  } catch (err) {
    console.error('Ошибка чтения data.json:', err);
    throw err;
  }
}

export async function writeData(data) {
  try {
    await fsp.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Ошибка записи data.json:', err);
    throw err;
  }
}

export async function deleteFile(filePath) {
  try {
    await fsp.unlink(filePath); // удалить старое изображение
  } catch (err) {
    if (err.code === 'ENOENT') {
      // пропустить ошибку, если файл не найден
    } else {
      throw err;
    }
  }
}

export async function openFile(filePath, flag = 'r') {
  try {
    return await fsp.open(filePath, flag);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`Не удалось открыть файл: файл по пути ${filePath} отсутствует.`);
    } else if (err.code === 'EACCES') {
      console.error(`Нет прав доступа для открытия файла ${filePath}.`);
    }
    throw err;
  }
}

export async function renameFile(tempPath, filePath) {
  try {
    await fsp.rename(tempPath, filePath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`Ошибка перемещения: временный файл ${tempPath} или целевая директория не существуют.`);
    } else if (err.code === 'ENOSPC') {
      console.error('На сервере закончилось свободное место на диске.');
    }
    throw err;
  }
}
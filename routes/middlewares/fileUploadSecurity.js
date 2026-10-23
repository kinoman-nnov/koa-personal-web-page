import crypto from 'crypto';
import path from 'path';
import { openFile, renameFile } from "../../services/storage.js";
import { UPLOAD_DIR } from '../../services/storage.js';

// Проверка является ли файл картинкой?
export async function isRealImage(filepath) {
  let fileHandle;
  try {
    // Читаем только первые 4 байта файла
    fileHandle = await openFile(filepath, 'r');
    const { buffer } = await fileHandle.read(Buffer.alloc(4), 0, 4, 0);

    // Переводим байты в шестнадцатеричную строку (HEX)
    const hex = buffer.toString('hex').toUpperCase();

    // Сигнатуры (Magic Numbers) легитимных картинок:
    const signatures = {
      jpg: hex.startsWith('FFD8FF'),         // JPEG / JPG
      png: hex.startsWith('89504E47'),       // PNG
      gif: hex.startsWith('47494638'),       // GIF
      webp: hex.startsWith('52494646')       // WEBP (RIFF)
    };

    // Если файл соответствует хоть одной сигнатуре, он валиден
    return Object.values(signatures).some(match => match === true);
  } catch (e) {
    return false;
  } finally {
    if (fileHandle) await fileHandle.close();
  }
}

export const saveImageFile = async (tempPic) => {
  try {
    // Если проверка прошла, двигаем его в постоянную папку
    const fileExt = path.extname(tempPic.originalFilename).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(fileExt) ? fileExt : '.jpg';
    const safeNewFilename = `${crypto.randomUUID()}${safeExt}`;
    await renameFile(tempPic.filepath, path.join(UPLOAD_DIR, safeNewFilename));

    // Возвращаем сгенерированное имя файла
    return safeNewFilename;
  } catch (err) {
    throw err;
  }
}
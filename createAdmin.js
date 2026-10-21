// создает Email и пароль для админки с записью в user.json
import fsp from 'fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { hashPassword, generateSalt  } from './services/password.js';

const rl = createInterface({ input, output });

async function createAdmin() {
  try {
    // Вызываем встроенный промис-метод напрямую у rl
    const email = await rl.question('Email: ');
    const password = await rl.question('Password: ');

    const userSalt = generateSalt();
    const hash = await hashPassword(password, userSalt);

    const admin = {
      id: 1,
      email,
      salt: userSalt,
      hash
    };

    await fsp.writeFile('./database/user.json', JSON.stringify(admin, null, 2));

    console.log('\nАдминистратор успешно создан.');

  } catch (err) {
    console.error(err);
  } finally {
    rl.close();
  }
}

createAdmin();
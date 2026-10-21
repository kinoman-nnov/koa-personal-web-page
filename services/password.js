import crypto from 'crypto';

export function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

export function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      salt,
      100000, // число итераций iterations
      64, // длина ключа keylen
      'sha512', // алгоритм digest
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey.toString('hex'));
      }
    )
  });
}
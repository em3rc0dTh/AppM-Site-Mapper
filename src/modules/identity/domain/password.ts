import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 256;

export function isPasswordLengthAcceptable(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH;
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        cost: COST,
        blockSize: BLOCK_SIZE,
        parallelization: PARALLELIZATION,
        maxmem: 64 * 1024 * 1024,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (!isPasswordLengthAcceptable(password)) {
    throw new Error(
      `Password must contain between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
    );
  }

  const salt = randomBytes(16);
  const key = await derive(password, salt);

  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (!isPasswordLengthAcceptable(password)) {
    return false;
  }

  const [algorithm, cost, blockSize, parallelization, saltEncoded, keyEncoded] = encoded.split('$');

  if (
    algorithm !== 'scrypt' ||
    cost !== String(COST) ||
    blockSize !== String(BLOCK_SIZE) ||
    parallelization !== String(PARALLELIZATION) ||
    !saltEncoded ||
    !keyEncoded
  ) {
    return false;
  }

  const expected = Buffer.from(keyEncoded, 'base64url');
  const actual = await derive(password, Buffer.from(saltEncoded, 'base64url'));

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

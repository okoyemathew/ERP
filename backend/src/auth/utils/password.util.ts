import * as bcrypt from 'bcrypt';

export async function hashPassword(
  plainText: string,
  saltRounds: number,
): Promise<string> {
  return bcrypt.hash(plainText, saltRounds);
}

export async function verifyPassword(
  plainText: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

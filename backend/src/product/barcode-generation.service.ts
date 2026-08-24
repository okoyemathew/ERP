import { Injectable } from '@nestjs/common';

@Injectable()
export class BarcodeGenerationService {
  generate({
    prefix = 'SKU',
    length = 10,
  }: { prefix?: string; length?: number } = {}): string {
    const numericLength = Math.max(4, length - prefix.length);
    const random = Array.from({ length: numericLength }, () =>
      Math.floor(Math.random() * 10),
    ).join('');

    return `${prefix}${random}`.slice(0, length || 12);
  }

  generateEan13(): string {
    const digits = Array.from({ length: 12 }, () =>
      Math.floor(Math.random() * 10),
    ).join('');

    let total = 0;
    for (let index = 0; index < digits.length; index += 1) {
      total += Number(digits[index]) * (index % 2 === 0 ? 1 : 3);
    }

    const checkDigit = (10 - (total % 10)) % 10;
    return `${digits}${checkDigit}`;
  }
}

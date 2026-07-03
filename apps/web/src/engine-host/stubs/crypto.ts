class HashShim {
  private input = '';

  constructor(private readonly prefix: string) {}

  update(data: unknown): this {
    this.input += typeof data === 'string' ? data : JSON.stringify(data);
    return this;
  }

  digest(encoding: 'hex' | 'base64' = 'hex'): string {
    const hex = stableHex(`${this.prefix}:${this.input}`);
    if (encoding === 'base64') {
      return btoa(hex);
    }
    return hex;
  }
}

export function createHash(algorithm: string): HashShim {
  return new HashShim(algorithm);
}

export function createHmac(algorithm: string, key: string): HashShim {
  return new HashShim(`${algorithm}:${key}`);
}

function stableHex(input: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;

  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index);
    a ^= code;
    a = Math.imul(a, 0x01000193) >>> 0;
    b ^= code + index;
    b = Math.imul(b, 0x85ebca6b) >>> 0;
  }

  const seed = `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
  return seed.repeat(4).slice(0, 64);
}

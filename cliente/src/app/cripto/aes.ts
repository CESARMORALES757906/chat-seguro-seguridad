const sbox = [
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
];

const sboxInversa: number[] = [];
for (let i = 0; i < 256; i++) {
  sboxInversa[sbox[i]] = i;
}

const rcon = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

function multiplicar(a: number, b: number): number {
  let resultado = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) {
      resultado = resultado ^ a;
    }
    let alto = a & 0x80;
    a = (a << 1) & 0xff;
    if (alto) {
      a = a ^ 0x1b;
    }
    b = b >> 1;
  }
  return resultado;
}

export function expandirClave(clave: number[]): number[][] {
  let palabras: number[][] = [];
  for (let i = 0; i < 4; i++) {
    palabras.push([clave[i * 4], clave[i * 4 + 1], clave[i * 4 + 2], clave[i * 4 + 3]]);
  }

  for (let i = 4; i < 44; i++) {
    let temp = [...palabras[i - 1]];
    if (i % 4 == 0) {
      temp = [temp[1], temp[2], temp[3], temp[0]];
      temp = [sbox[temp[0]], sbox[temp[1]], sbox[temp[2]], sbox[temp[3]]];
      temp[0] = temp[0] ^ rcon[i / 4];
    }
    let anterior = palabras[i - 4];
    palabras.push([anterior[0] ^ temp[0], anterior[1] ^ temp[1], anterior[2] ^ temp[2], anterior[3] ^ temp[3]]);
  }

  let llaves: number[][] = [];
  for (let ronda = 0; ronda < 11; ronda++) {
    llaves.push([
      ...palabras[ronda * 4],
      ...palabras[ronda * 4 + 1],
      ...palabras[ronda * 4 + 2],
      ...palabras[ronda * 4 + 3],
    ]);
  }
  return llaves;
}

function sumarLlave(estado: number[], llave: number[]): number[] {
  let nuevo: number[] = [];
  for (let i = 0; i < 16; i++) {
    nuevo.push(estado[i] ^ llave[i]);
  }
  return nuevo;
}

function sustituir(estado: number[]): number[] {
  let nuevo: number[] = [];
  for (let i = 0; i < 16; i++) {
    nuevo.push(sbox[estado[i]]);
  }
  return nuevo;
}

function sustituirInversa(estado: number[]): number[] {
  let nuevo: number[] = [];
  for (let i = 0; i < 16; i++) {
    nuevo.push(sboxInversa[estado[i]]);
  }
  return nuevo;
}

function desplazarFilas(estado: number[]): number[] {
  let nuevo: number[] = [];
  for (let columna = 0; columna < 4; columna++) {
    for (let fila = 0; fila < 4; fila++) {
      nuevo[columna * 4 + fila] = estado[((columna + fila) % 4) * 4 + fila];
    }
  }
  return nuevo;
}

function desplazarFilasInversa(estado: number[]): number[] {
  let nuevo: number[] = [];
  for (let columna = 0; columna < 4; columna++) {
    for (let fila = 0; fila < 4; fila++) {
      nuevo[((columna + fila) % 4) * 4 + fila] = estado[columna * 4 + fila];
    }
  }
  return nuevo;
}

function mezclarColumnas(estado: number[]): number[] {
  let nuevo: number[] = [];
  for (let c = 0; c < 4; c++) {
    let a0 = estado[c * 4];
    let a1 = estado[c * 4 + 1];
    let a2 = estado[c * 4 + 2];
    let a3 = estado[c * 4 + 3];
    nuevo[c * 4] = multiplicar(a0, 2) ^ multiplicar(a1, 3) ^ a2 ^ a3;
    nuevo[c * 4 + 1] = a0 ^ multiplicar(a1, 2) ^ multiplicar(a2, 3) ^ a3;
    nuevo[c * 4 + 2] = a0 ^ a1 ^ multiplicar(a2, 2) ^ multiplicar(a3, 3);
    nuevo[c * 4 + 3] = multiplicar(a0, 3) ^ a1 ^ a2 ^ multiplicar(a3, 2);
  }
  return nuevo;
}

function mezclarColumnasInversa(estado: number[]): number[] {
  let nuevo: number[] = [];
  for (let c = 0; c < 4; c++) {
    let a0 = estado[c * 4];
    let a1 = estado[c * 4 + 1];
    let a2 = estado[c * 4 + 2];
    let a3 = estado[c * 4 + 3];
    nuevo[c * 4] = multiplicar(a0, 14) ^ multiplicar(a1, 11) ^ multiplicar(a2, 13) ^ multiplicar(a3, 9);
    nuevo[c * 4 + 1] = multiplicar(a0, 9) ^ multiplicar(a1, 14) ^ multiplicar(a2, 11) ^ multiplicar(a3, 13);
    nuevo[c * 4 + 2] = multiplicar(a0, 13) ^ multiplicar(a1, 9) ^ multiplicar(a2, 14) ^ multiplicar(a3, 11);
    nuevo[c * 4 + 3] = multiplicar(a0, 11) ^ multiplicar(a1, 13) ^ multiplicar(a2, 9) ^ multiplicar(a3, 14);
  }
  return nuevo;
}

export function cifrarBloque(bloque: number[], llaves: number[][]): number[] {
  let estado = sumarLlave(bloque, llaves[0]);
  for (let ronda = 1; ronda < 10; ronda++) {
    estado = sustituir(estado);
    estado = desplazarFilas(estado);
    estado = mezclarColumnas(estado);
    estado = sumarLlave(estado, llaves[ronda]);
  }
  estado = sustituir(estado);
  estado = desplazarFilas(estado);
  estado = sumarLlave(estado, llaves[10]);
  return estado;
}

export function descifrarBloque(bloque: number[], llaves: number[][]): number[] {
  let estado = sumarLlave(bloque, llaves[10]);
  for (let ronda = 9; ronda > 0; ronda--) {
    estado = desplazarFilasInversa(estado);
    estado = sustituirInversa(estado);
    estado = sumarLlave(estado, llaves[ronda]);
    estado = mezclarColumnasInversa(estado);
  }
  estado = desplazarFilasInversa(estado);
  estado = sustituirInversa(estado);
  estado = sumarLlave(estado, llaves[0]);
  return estado;
}

function rellenar(datos: number[]): number[] {
  let faltan = 16 - (datos.length % 16);
  let resultado = [...datos];
  for (let i = 0; i < faltan; i++) {
    resultado.push(faltan);
  }
  return resultado;
}

function quitarRelleno(datos: number[]): number[] {
  let faltan = datos[datos.length - 1];
  if (faltan < 1 || faltan > 16) {
    throw new Error('El relleno no es correcto');
  }
  return datos.slice(0, datos.length - faltan);
}

export function cifrar(texto: string, clave: number[], iv: number[]): number[] {
  let llaves = expandirClave(clave);
  let datos = rellenar(Array.from(new TextEncoder().encode(texto)));
  let anterior = iv;
  let cifrado: number[] = [];

  for (let i = 0; i < datos.length; i += 16) {
    let bloque: number[] = [];
    for (let j = 0; j < 16; j++) {
      bloque.push(datos[i + j] ^ anterior[j]);
    }
    anterior = cifrarBloque(bloque, llaves);
    cifrado.push(...anterior);
  }
  return cifrado;
}

export function descifrar(cifrado: number[], clave: number[], iv: number[]): string {
  let llaves = expandirClave(clave);
  let anterior = iv;
  let datos: number[] = [];

  for (let i = 0; i < cifrado.length; i += 16) {
    let bloque = cifrado.slice(i, i + 16);
    let descifrado = descifrarBloque(bloque, llaves);
    for (let j = 0; j < 16; j++) {
      datos.push(descifrado[j] ^ anterior[j]);
    }
    anterior = bloque;
  }
  return new TextDecoder().decode(new Uint8Array(quitarRelleno(datos)));
}

export function generarIV(): number[] {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)));
}

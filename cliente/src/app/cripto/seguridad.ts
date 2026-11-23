import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { cifrar, descifrar, generarIV } from './aes.ts';

export type Claves = {
  aes: number[];
  hmac: number[];
  codigo: string;
};

export type Paquete = {
  iv: string;
  cifrado: string;
  hmac: string;
};

export function aHex(bytes: number[] | Uint8Array): string {
  return bytesToHex(new Uint8Array(bytes));
}

export function deHex(hex: string): number[] {
  return Array.from(hexToBytes(hex));
}

export function generarSal(): string {
  return aHex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashDeContrasena(contrasena: string, sal: string): Promise<string> {
  let hash = await pbkdf2Async(sha256, utf8ToBytes(contrasena), hexToBytes(sal), { c: 100000, dkLen: 32 });
  return bytesToHex(hash);
}

export function respuestaAlReto(hash: string, reto: string): string {
  return bytesToHex(hmac(sha256, hexToBytes(hash), utf8ToBytes(reto)));
}

export function derivarClaves(llave: bigint): Claves {
  let hexDeLlave = llave.toString(16).padStart(512, '0');
  let resumen = Array.from(sha256(hexToBytes(hexDeLlave)));
  let codigo = bytesToHex(sha256(utf8ToBytes('codigo' + hexDeLlave))).substring(0, 8).toUpperCase();
  return {
    aes: resumen.slice(0, 16),
    hmac: resumen.slice(16, 32),
    codigo: codigo.substring(0, 4) + '-' + codigo.substring(4, 8),
  };
}

function calcularHmac(claves: Claves, de: string, para: string, numero: number, iv: string, cifrado: string): string {
  let datos = de + '|' + para + '|' + numero + '|' + iv + '|' + cifrado;
  return bytesToHex(hmac(sha256, new Uint8Array(claves.hmac), utf8ToBytes(datos)));
}

export function crearPaquete(texto: string, claves: Claves, de: string, para: string, numero: number): Paquete {
  let iv = generarIV();
  let cifrado = aHex(cifrar(texto, claves.aes, iv));
  let ivHex = aHex(iv);
  return {
    iv: ivHex,
    cifrado: cifrado,
    hmac: calcularHmac(claves, de, para, numero, ivHex, cifrado),
  };
}

export function abrirPaquete(paquete: Paquete, claves: Claves, de: string, para: string, numero: number): string {
  let esperado = calcularHmac(claves, de, para, numero, paquete.iv, paquete.cifrado);
  if (esperado != paquete.hmac) {
    throw new Error('El HMAC no coincide');
  }
  return descifrar(deHex(paquete.cifrado), claves.aes, deHex(paquete.iv));
}

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const archivo = process.env.BASEDATOS || path.join(import.meta.dirname, 'chat.db');
const bd = new DatabaseSync(archivo);

bd.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT UNIQUE NOT NULL,
    sal TEXT NOT NULL,
    hash TEXT NOT NULL,
    fecha TEXT DEFAULT (datetime('now', 'localtime'))
  )
`);

bd.exec(`
  CREATE TABLE IF NOT EXISTS mensajes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    de TEXT NOT NULL,
    para TEXT NOT NULL,
    iv TEXT NOT NULL,
    cifrado TEXT NOT NULL,
    hmac TEXT NOT NULL,
    numero INTEGER NOT NULL,
    fecha TEXT DEFAULT (datetime('now', 'localtime'))
  )
`);

bd.exec(`
  CREATE TABLE IF NOT EXISTS alertas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    de TEXT NOT NULL,
    para TEXT NOT NULL,
    numero INTEGER NOT NULL,
    motivo TEXT NOT NULL,
    fecha TEXT DEFAULT (datetime('now', 'localtime'))
  )
`);

export type Usuario = {
  nombre: string;
  sal: string;
  hash: string;
};

export function crearUsuario(nombre: string, sal: string, hash: string) {
  bd.prepare('INSERT INTO usuarios (nombre, sal, hash) VALUES (?, ?, ?)').run(nombre, sal, hash);
}

export function buscarUsuario(nombre: string): Usuario | undefined {
  return bd.prepare('SELECT nombre, sal, hash FROM usuarios WHERE nombre = ?').get(nombre) as Usuario | undefined;
}

export function nombresDeUsuarios(): string[] {
  let filas = bd.prepare('SELECT nombre FROM usuarios ORDER BY nombre').all() as { nombre: string }[];
  return filas.map((fila) => fila.nombre);
}

export function guardarMensaje(de: string, para: string, iv: string, cifrado: string, hmac: string, numero: number) {
  bd.prepare('INSERT INTO mensajes (de, para, iv, cifrado, hmac, numero) VALUES (?, ?, ?, ?, ?, ?)').run(
    de,
    para,
    iv,
    cifrado,
    hmac,
    numero,
  );
}

export function guardarAlerta(de: string, para: string, numero: number, motivo: string) {
  bd.prepare('INSERT INTO alertas (de, para, numero, motivo) VALUES (?, ?, ?, ?)').run(de, para, numero, motivo);
}

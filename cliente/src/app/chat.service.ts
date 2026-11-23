import { Injectable, signal } from '@angular/core';
import { P, elegirGenerador, esGenerador, numeroSecreto, llavePublica, llaveCompartida } from './cripto/dh.ts';
import {
  Claves,
  generarSal,
  hashDeContrasena,
  respuestaAlReto,
  derivarClaves,
  crearPaquete,
  abrirPaquete,
} from './cripto/seguridad.ts';

export type Usuario = {
  nombre: string;
  conectado: boolean;
};

export type Mensaje = {
  tipo: 'normal' | 'aviso' | 'error';
  de: string;
  texto: string;
};

export type Sesion = {
  claves: Claves;
  g: string;
  A: string;
  B: string;
  enviados: number;
  ultimoRecibido: number;
};

type Pendiente = {
  secreto: bigint;
  g: bigint;
  A: bigint;
};

@Injectable({ providedIn: 'root' })
export class ChatService {
  usuario = signal('');
  usuarios = signal<Usuario[]>([]);
  seleccionado = signal('');
  conversaciones = signal<Record<string, Mensaje[]>>({});
  sesiones = signal<Record<string, Sesion>>({});
  sinLeer = signal<Record<string, number>>({});
  error = signal('');
  cargando = signal(false);

  private socket: WebSocket | null = null;
  private pendientes: Record<string, Pendiente> = {};
  private nombreLogin = '';
  private contrasenaLogin = '';

  private conectar(): Promise<void> {
    if (this.socket && this.socket.readyState == WebSocket.OPEN) {
      return Promise.resolve();
    }

    return new Promise((listo, fallo) => {
      let direccion = 'ws://' + location.host;
      if (location.port == '4200') {
        direccion = 'ws://' + location.hostname + ':3000';
      }

      this.socket = new WebSocket(direccion);
      this.socket.onopen = () => listo();
      this.socket.onerror = () => fallo();
      this.socket.onmessage = (evento) => this.recibir(JSON.parse(evento.data));
      this.socket.onclose = () => {
        if (this.usuario()) {
          this.limpiar();
          this.error.set('Se perdió la conexión con el servidor');
        }
      };
    });
  }

  private enviar(datos: object) {
    if (this.socket && this.socket.readyState == WebSocket.OPEN) {
      this.socket.send(JSON.stringify(datos));
    }
  }

  async entrar(nombre: string, contrasena: string, registrarse: boolean) {
    this.error.set('');
    if (!nombre.trim() || !contrasena) {
      this.error.set('Escribe tu usuario y contraseña');
      return;
    }

    this.cargando.set(true);
    try {
      await this.conectar();
    } catch (e) {
      this.cargando.set(false);
      this.error.set('No se pudo conectar con el servidor');
      return;
    }

    this.nombreLogin = nombre.trim().toLowerCase();
    this.contrasenaLogin = contrasena;

    if (registrarse) {
      let sal = generarSal();
      let hash = await hashDeContrasena(contrasena, sal);
      this.enviar({ tipo: 'registro', usuario: this.nombreLogin, sal: sal, hash: hash });
    } else {
      this.enviar({ tipo: 'pedirReto', usuario: this.nombreLogin });
    }
  }

  salir() {
    this.limpiar();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  private limpiar() {
    this.usuario.set('');
    this.usuarios.set([]);
    this.seleccionado.set('');
    this.conversaciones.set({});
    this.sesiones.set({});
    this.sinLeer.set({});
    this.pendientes = {};
  }

  private async recibir(mensaje: any) {
    if (mensaje.tipo == 'registroOk') {
      this.enviar({ tipo: 'pedirReto', usuario: this.nombreLogin });
    } else if (mensaje.tipo == 'reto') {
      let hash = await hashDeContrasena(this.contrasenaLogin, mensaje.sal);
      this.enviar({ tipo: 'login', usuario: this.nombreLogin, respuesta: respuestaAlReto(hash, mensaje.reto) });
    } else if (mensaje.tipo == 'loginOk') {
      this.contrasenaLogin = '';
      this.cargando.set(false);
      this.error.set('');
      this.usuario.set(mensaje.usuario);
    } else if (mensaje.tipo == 'error') {
      this.cargando.set(false);
      this.error.set(mensaje.mensaje);
    } else if (mensaje.tipo == 'usuarios') {
      this.actualizarUsuarios(mensaje.lista);
    } else if (mensaje.tipo == 'dhInicio') {
      this.recibirInicioDH(mensaje);
    } else if (mensaje.tipo == 'dhRespuesta') {
      this.recibirRespuestaDH(mensaje);
    } else if (mensaje.tipo == 'mensaje') {
      this.recibirMensaje(mensaje);
    } else if (mensaje.tipo == 'alerta') {
      this.recibirAlerta(mensaje);
    }
  }

  private actualizarUsuarios(lista: Usuario[]) {
    let otros = lista.filter((u) => u.nombre != this.usuario());
    for (let u of otros) {
      if (!u.conectado && this.sesiones()[u.nombre]) {
        this.borrarSesion(u.nombre);
        this.agregar(u.nombre, { tipo: 'aviso', de: '', texto: u.nombre + ' se desconectó. Las llaves de esta sesión se borraron.' });
      }
      if (!u.conectado) {
        delete this.pendientes[u.nombre];
      }
    }
    this.usuarios.set(otros);

    let elegido = otros.find((u) => u.nombre == this.seleccionado());
    if (elegido && elegido.conectado && !this.sesiones()[elegido.nombre] && !this.pendientes[elegido.nombre]) {
      this.iniciarDH(elegido.nombre);
    }
  }

  seleccionar(nombre: string) {
    this.seleccionado.set(nombre);
    this.sinLeer.update((s) => ({ ...s, [nombre]: 0 }));
    this.error.set('');

    let usuario = this.usuarios().find((u) => u.nombre == nombre);
    if (usuario && usuario.conectado && !this.sesiones()[nombre] && !this.pendientes[nombre]) {
      this.iniciarDH(nombre);
    }
  }

  private iniciarDH(nombre: string) {
    let g = elegirGenerador(P);
    let secreto = numeroSecreto(P);
    let A = llavePublica(g, secreto, P);
    this.pendientes[nombre] = { secreto: secreto, g: g, A: A };

    this.agregar(nombre, { tipo: 'aviso', de: '', texto: 'Iniciando Diffie-Hellman con ' + nombre + '...' });
    this.enviar({ tipo: 'dhInicio', para: nombre, p: P.toString(16), g: g.toString(16), A: A.toString(16) });
  }

  private recibirInicioDH(mensaje: any) {
    let de = mensaje.de;

    if (this.pendientes[de] && this.usuario() < de) {
      return;
    }
    delete this.pendientes[de];

    try {
      let p = BigInt('0x' + mensaje.p);
      let g = BigInt('0x' + mensaje.g);
      let A = BigInt('0x' + mensaje.A);

      if (p != P) {
        throw new Error('el numero P no es el esperado');
      }
      if (!esGenerador(g, p)) {
        throw new Error('G no es un generador valido');
      }

      let secreto = numeroSecreto(p);
      let B = llavePublica(g, secreto, p);
      let llave = llaveCompartida(A, secreto, p);

      this.enviar({ tipo: 'dhRespuesta', para: de, B: B.toString(16) });
      this.guardarSesion(de, llave, g, A, B);
    } catch (e: any) {
      this.agregar(de, { tipo: 'error', de: '', texto: 'Diffie-Hellman rechazado: ' + e.message });
    }
  }

  private recibirRespuestaDH(mensaje: any) {
    let de = mensaje.de;
    let pendiente = this.pendientes[de];
    if (!pendiente) {
      return;
    }
    delete this.pendientes[de];

    try {
      let B = BigInt('0x' + mensaje.B);
      let llave = llaveCompartida(B, pendiente.secreto, P);
      this.guardarSesion(de, llave, pendiente.g, pendiente.A, B);
    } catch (e: any) {
      this.agregar(de, { tipo: 'error', de: '', texto: 'Diffie-Hellman rechazado: ' + e.message });
    }
  }

  private guardarSesion(nombre: string, llave: bigint, g: bigint, A: bigint, B: bigint) {
    let sesion: Sesion = {
      claves: derivarClaves(llave),
      g: g.toString(16),
      A: A.toString(16),
      B: B.toString(16),
      enviados: 0,
      ultimoRecibido: 0,
    };
    this.sesiones.update((s) => ({ ...s, [nombre]: sesion }));
    this.agregar(nombre, {
      tipo: 'aviso',
      de: '',
      texto: 'Conexión segura lista. Código de verificación: ' + sesion.claves.codigo,
    });
  }

  private borrarSesion(nombre: string) {
    this.sesiones.update((s) => {
      let copia = { ...s };
      delete copia[nombre];
      return copia;
    });
  }

  enviarMensaje(texto: string) {
    let para = this.seleccionado();
    let sesion = this.sesiones()[para];
    if (!sesion) {
      return;
    }

    sesion.enviados++;
    let paquete = crearPaquete(texto, sesion.claves, this.usuario(), para, sesion.enviados);
    this.enviar({ tipo: 'mensaje', para: para, numero: sesion.enviados, ...paquete });
    this.agregar(para, { tipo: 'normal', de: this.usuario(), texto: texto });
  }

  private recibirMensaje(mensaje: any) {
    let de = mensaje.de;
    let sesion = this.sesiones()[de];

    if (!sesion) {
      this.agregar(de, { tipo: 'error', de: '', texto: 'Llegó un mensaje de ' + de + ' pero no hay conexión segura' });
      return;
    }

    let texto = '';
    try {
      texto = abrirPaquete(mensaje, sesion.claves, de, this.usuario(), mensaje.numero);
    } catch (e) {
      this.agregar(de, {
        tipo: 'error',
        de: '',
        texto:
          'ALERTA ' + this.hora() + ': el mensaje #' + mensaje.numero + ' de ' + de +
          ' fue alterado en el camino y se rechazó (el HMAC no coincide). Los demás mensajes siguen llegando normal.',
      });
      this.enviar({ tipo: 'alerta', para: de, numero: mensaje.numero, motivo: 'alterado' });
      return;
    }

    if (mensaje.numero <= sesion.ultimoRecibido) {
      this.agregar(de, {
        tipo: 'error',
        de: '',
        texto:
          'ALERTA ' + this.hora() + ': el mensaje #' + mensaje.numero + ' de ' + de +
          ' ya había llegado antes, alguien lo volvió a mandar (mensaje repetido) y se rechazó. Los demás mensajes siguen llegando normal.',
      });
      this.enviar({ tipo: 'alerta', para: de, numero: mensaje.numero, motivo: 'repetido' });
      return;
    }

    sesion.ultimoRecibido = mensaje.numero;
    this.agregar(de, { tipo: 'normal', de: de, texto: texto });

    if (this.seleccionado() != de) {
      this.sinLeer.update((s) => ({ ...s, [de]: (s[de] || 0) + 1 }));
    }
  }

  private recibirAlerta(mensaje: any) {
    let de = mensaje.de;
    let texto = 'ALERTA ' + this.hora() + ': tu mensaje #' + mensaje.numero + ' a ' + de;
    if (mensaje.motivo == 'repetido') {
      texto += ' fue enviado otra vez por alguien más (mensaje repetido) y ' + de + ' lo rechazó';
    } else {
      texto += ' llegó alterado y ' + de + ' lo rechazó';
    }
    this.agregar(de, { tipo: 'error', de: '', texto: texto });
  }

  private hora(): string {
    return new Date().toTimeString().substring(0, 8);
  }

  private agregar(nombre: string, mensaje: Mensaje) {
    this.conversaciones.update((c) => ({ ...c, [nombre]: [...(c[nombre] || []), mensaje] }));
  }
}

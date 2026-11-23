import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { ChatService } from './chat.service';

@Component({
  selector: 'app-root',
  imports: [FormsModule, SlicePipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  chat = inject(ChatService);

  nombre = '';
  contrasena = '';
  texto = '';
  verDatos = signal(false);

  cajaMensajes = viewChild<ElementRef>('cajaMensajes');

  sesionActual = computed(() => this.chat.sesiones()[this.chat.seleccionado()]);
  mensajesActuales = computed(() => this.chat.conversaciones()[this.chat.seleccionado()] || []);
  estaConectado = computed(() => this.chat.usuarios().some((u) => u.nombre == this.chat.seleccionado() && u.conectado));

  constructor() {
    effect(() => {
      this.mensajesActuales();
      let caja = this.cajaMensajes();
      if (caja) {
        setTimeout(() => (caja.nativeElement.scrollTop = caja.nativeElement.scrollHeight));
      }
    });
  }

  entrar() {
    this.chat.entrar(this.nombre, this.contrasena, false);
    this.contrasena = '';
  }

  registrarme() {
    this.chat.entrar(this.nombre, this.contrasena, true);
    this.contrasena = '';
  }

  enviar() {
    if (this.texto.trim() == '') {
      return;
    }
    this.chat.enviarMensaje(this.texto);
    this.texto = '';
  }

  abrirChat(nombre: string) {
    this.verDatos.set(false);
    this.chat.seleccionar(nombre);
  }

  volver() {
    this.verDatos.set(false);
    this.chat.seleccionado.set('');
  }

  inicial(nombre: string): string {
    return nombre.charAt(0).toUpperCase();
  }
}

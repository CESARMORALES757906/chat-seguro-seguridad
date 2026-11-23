# Chat Seguro

Chat cliente-servidor con:

1. **Confidencialidad**: los mensajes se cifran con **AES-128 en modo CBC** (programado a mano).
2. **Intercambio de clave**: la clave de AES se acuerda con **Diffie-Hellman** (programado a mano, siguiendo las diapositivas del curso).
3. **Autenticación**: usuario y contraseña con reto-respuesta; la contraseña nunca viaja por la red.
4. **Integridad**: cada mensaje lleva un **HMAC-SHA256** y un número de secuencia (detecta mensajes alterados y repetidos).
5. **Pruebas**: un programa "atacante" en terminal que espía, modifica, bloquea y repite mensajes, y pruebas automáticas del AES y del DH.

Todo está hecho en **TypeScript**: el cliente en Angular y el servidor en Node.js con WebSockets.

---

## Requisitos

- **Node.js 24 o más nuevo**: https://nodejs.org (se usa `node:sqlite` y Node corre los `.ts` directamente).
- Git.
- Opcional, para ver la base de datos: **DB Browser for SQLite** (https://sqlitebrowser.org) o la extensión **SQLite Viewer** de VS Code.

## Instalación (solo la primera vez)

```bash
git clone https://github.com/CESARMORALES757906/chat-seguro-seguridad.git
cd chat-seguro-seguridad

cd cliente
npm install
npm run build
cd ..

cd servidor
npm install
cd ..

cd atacante
npm install
cd ..

cd pruebas
npm install
cd ..
```

`npm run build` convierte el proyecto de Angular en la página que entrega el servidor. Hay que volver a correrlo solo si se cambia algo dentro de `cliente/`.

## Cómo correrlo

**Terminal 1: el servidor (puerto 3000)**

```bash
cd servidor
npm start
```

Muestra las direcciones para entrar, por ejemplo `http://localhost:3000` y `http://192.168.1.50:3000` (la segunda es para otros dispositivos de la misma red).

**Terminal 2: el atacante (puerto 4000)**, solo para las pruebas de ataque:

```bash
cd atacante
npm start
```

- Entrando por el **3000**, los usuarios van directo al servidor.
- Entrando por el **4000**, todo pasa por el atacante antes de llegar al servidor. Es el mismo chat y el mismo cifrado; solo hay alguien en medio.

Para probarlo en una sola computadora, usa una ventana normal y una de incógnito, una para cada usuario.

### Entrar desde otro dispositivo (celular u otra laptop)

Tienen que estar en la misma red WiFi. En Windows hay que abrir los puertos en el firewall (PowerShell **como administrador**):

```powershell
New-NetFirewallRule -DisplayName "Chat Seguro" -Direction Inbound -Protocol TCP -LocalPort 3000,4000 -Action Allow -Profile Any
```

Al terminar, se cierra con:

```powershell
Remove-NetFirewallRule -DisplayName "Chat Seguro"
```

Algunas redes (como la de la escuela) bloquean la conexión entre dispositivos. En ese caso usen el hotspot de un celular.

---

## Guion de la demostración

| # | Qué se demuestra | Cómo |
|---|---|---|
| 1 | Chat funcionando | Registrar dos usuarios (de preferencia por el **3000**, para que el atacante no vea el registro). En la lista salen los usuarios en línea; los desconectados salen en gris y no se les puede escribir. |
| 2 | Diffie-Hellman | Abrir el chat: en las dos pantallas sale *"Conexión segura lista. Código de verificación: XXXX-XXXX"*. Con el botón **🔒 Cifrado** se ven P, G, A, B y el código, que es **igual en los dos lados**. |
| 3 | Autenticación | Una contraseña incorrecta se rechaza. En la terminal del atacante se ve que en el login solo viajan `reto` y `respuesta`, nunca la contraseña. |
| 4 | Confidencialidad | Entrar por el **4000** y mandar un mensaje. En la terminal del atacante la lista de usuarios se lee tal cual, pero el mensaje solo aparece como `cifrado: 82ff76b7...`. |
| 5 | Integridad (alteración) | En la terminal del atacante escribir `i`, mandar un mensaje (se detiene), escribir `m`, luego `cifrado`, cambiar una letra y Enter. El receptor muestra una **ALERTA** en rojo, el remitente recibe un aviso y el servidor imprime la alerta. Después el chat sigue normal. |
| 6 | Bloqueo | `i`, mandar un mensaje y escribir `b`: el mensaje nunca llega. Se puede cortar la comunicación, pero no leerla ni cambiarla. |
| 7 | Repetición (replay) | Mandar un mensaje normal y escribir `r` en el atacante: el receptor lo rechaza como **repetido**. |
| 8 | Base de datos | Abrir `servidor/chat.db` con DB Browser. En `mensajes` solo hay texto cifrado; en `alertas` quedan los ataques detectados; en `usuarios` solo sal y hash, nunca la contraseña. |
| 9 | Pruebas del AES y del DH | `cd pruebas` y `npm run cripto`: tienen que salir **43 OK**. |

Opcional: con **Wireshark** (filtro `tcp.port == 3000`) se puede confirmar con una herramienta externa que por la red solo viaja el texto cifrado.

### Comandos del atacante

| Comando | Qué hace |
|---|---|
| `i` | Detiene **el siguiente** mensaje. Luego se elige `Enter` (dejarlo pasar), `m` (modificarlo) o `b` (bloquearlo), y el atacante vuelve solo a espiar. |
| `r` | Vuelve a mandar el último mensaje que pasó (ataque de repetición). |
| `Ctrl + C` | Salir. |

---

## Estructura

```
cliente/      Página web en Angular (Bootstrap)
  src/app/cripto/aes.ts         AES-128 programado a mano (S-Box, expansión de clave, rondas, CBC, relleno PKCS7)
  src/app/cripto/dh.ts          Diffie-Hellman programado a mano (primo de 2048 bits, prueba del generador)
  src/app/cripto/seguridad.ts   Hash de contraseña, reto-respuesta, derivar claves, HMAC, armar/abrir paquetes
  src/app/chat.service.ts       Conexión con el servidor, login, intercambio DH, enviar/recibir, alertas
  src/app/app.html / app.css    Interfaz
servidor/     Servidor en Node.js: entrega la página, WebSocket, login, reenvía mensajes, base de datos SQLite
atacante/     Programa "hombre en medio" en terminal: espía, modifica, bloquea y repite mensajes
pruebas/      Pruebas automáticas del AES, el DH y la integridad
```

## Cómo funciona (resumen)

**Registro e inicio de sesión**
1. Al registrarse, el navegador genera una **sal** aleatoria y calcula `hash = PBKDF2-SHA256(contraseña, sal, 100000 iteraciones)`. Al servidor solo llegan la sal y el hash.
2. Para entrar, el servidor manda la sal y un **reto** aleatorio que solo sirve una vez. El navegador responde `HMAC-SHA256(hash, reto)`, y el servidor hace la misma cuenta y compara.
3. La contraseña nunca viaja, y una respuesta capturada no sirve después porque el reto cambia cada vez.

**Diffie-Hellman** (diapositivas del curso)
1. Se usa el primo de 2048 bits del RFC 3526 (es un primo seguro: `p = 2q + 1`).
2. El generador `g` se elige con la prueba de la diapositiva 7: `g² mod p ≠ 1` y `g^q mod p ≠ 1`.
3. Quien inicia manda **A, P y G**; el otro responde con **B**. Los dos calculan la misma `K` sin mandarla nunca.
4. De `K` se sacan, con SHA-256, la clave de AES (16 bytes), la clave del HMAC (16 bytes) y el **código de verificación** que se compara en las dos pantallas.
5. Las claves duran lo que dura la sesión: si alguien se desconecta, se borran.

**Cada mensaje**
1. Se cifra con AES-128-CBC usando un **IV aleatorio** nuevo.
2. Se calcula `HMAC-SHA256(de | para | número | iv | cifrado)`.
3. Al servidor llega solo `{ número, iv, cifrado, hmac }`, y así se guarda en la base de datos.
4. El receptor revisa primero el HMAC (si no coincide: **alterado**) y luego el número (si ya llegó antes: **repetido**). Solo si todo está bien lo descifra.

## Librerías usadas

| Librería | Para qué |
|---|---|
| `@noble/hashes` | SHA-256, HMAC y PBKDF2 (**no** se programaron a mano; el AES y el DH sí) |
| `ws` | WebSockets en el servidor y en el atacante |
| Bootstrap 5.3.8 | Estilos de la interfaz (`cliente/src/bootstrap.min.css`) |
| Angular | Cliente web |

## Limitaciones conocidas

- **Eavesdropping**: espiar no se puede detectar (el atacante solo copia lo que pasa). Por eso se cifra: aunque escuche, no entiende nada.
- **Bloqueo**: el atacante puede borrar mensajes. El cifrado no evita que se corte la comunicación.
- **Registro**: el hash que se manda al registrarse sirve para iniciar sesión. Si alguien lo captura durante el registro podría entrar como ese usuario, así que el registro debería hacerse por un canal seguro (en la vida real, HTTPS).
- **Hombre en medio en el Diffie-Hellman**: el DH por sí solo no sabe con quién habla. Para eso está el código de verificación: si no es igual en las dos pantallas, hay alguien en medio.
- **Historial**: las claves son por sesión, así que al volver a entrar no se pueden leer los mensajes anteriores (en la base de datos solo quedan cifrados).
- Los `.ts` se corren directo con Node 24. En versiones más viejas de Node no funciona.

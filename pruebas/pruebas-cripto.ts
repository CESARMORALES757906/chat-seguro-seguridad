import { createCipheriv, getDiffieHellman, pbkdf2Sync, createHmac } from 'node:crypto';
import {
  hashDeContrasena,
  respuestaAlReto,
  derivarClaves,
  crearPaquete,
  abrirPaquete,
  generarSal,
} from '../cliente/src/app/cripto/seguridad.ts';
import { cifrar, descifrar, cifrarBloque, descifrarBloque, expandirClave, generarIV } from '../cliente/src/app/cripto/aes.ts';
import {
  P,
  potenciaModular,
  esGenerador,
  elegirGenerador,
  numeroSecreto,
  llavePublica,
  llaveCompartida,
} from '../cliente/src/app/cripto/dh.ts';

let pasaron = 0;
let fallaron = 0;

function probar(nombre: string, resultado: boolean) {
  if (resultado) {
    pasaron++;
    console.log('  OK    ' + nombre);
  } else {
    fallaron++;
    console.log('  FALLO ' + nombre);
  }
}

function deHex(hex: string): number[] {
  let bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return bytes;
}

function aHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

console.log('\nAES-128');

let llaves = expandirClave(deHex('2b7e151628aed2a6abf7158809cf4f3c'));
let resultado = cifrarBloque(deHex('3243f6a8885a308d313198a2e0370734'), llaves);
probar('FIPS-197 Apendice B: cifrar bloque', aHex(resultado) == '3925841d02dc09fbdc118597196a0b32');
probar('FIPS-197 Apendice B: descifrar bloque', aHex(descifrarBloque(resultado, llaves)) == '3243f6a8885a308d313198a2e0370734');
probar('FIPS-197 Apendice A.1: ultima llave de ronda', aHex(llaves[10]) == 'd014f9a8c9ee2589e13f0cc8b6630ca6');

llaves = expandirClave(deHex('000102030405060708090a0b0c0d0e0f'));
resultado = cifrarBloque(deHex('00112233445566778899aabbccddeeff'), llaves);
probar('FIPS-197 Apendice C.1: cifrar bloque', aHex(resultado) == '69c4e0d86a7b0430d8cdb78070b4c55a');
probar('FIPS-197 Apendice C.1: descifrar bloque', aHex(descifrarBloque(resultado, llaves)) == '00112233445566778899aabbccddeeff');

let textos = ['hola', 'exactamente 16 b', 'nos vemos a las 5 en la biblioteca', 'canción con ñ y acentos áéíóú', ''];
for (let texto of textos) {
  let clave = generarIV();
  let iv = generarIV();
  let mio = cifrar(texto, clave, iv);
  let cifradorNode = createCipheriv('aes-128-cbc', Buffer.from(clave), Buffer.from(iv));
  let deNode = Buffer.concat([cifradorNode.update(texto, 'utf8'), cifradorNode.final()]).toString('hex');
  probar('CBC igual que el AES de Node: "' + texto + '"', aHex(mio) == deNode);
  probar('CBC cifrar y descifrar: "' + texto + '"', descifrar(mio, clave, iv) == texto);
}

let clave = generarIV();
let iv = generarIV();
let cifrado = cifrar('mensaje secreto', clave, iv);
let otraClave = generarIV();
let conOtraClave = '';
try {
  conOtraClave = descifrar(cifrado, otraClave, iv);
} catch (e) {
  conOtraClave = 'error';
}
probar('Con otra clave no sale el mensaje', conOtraClave != 'mensaje secreto');
probar('Mismo mensaje con distinto IV da distinto cifrado', aHex(cifrar('hola', clave, generarIV())) != aHex(cifrar('hola', clave, generarIV())));

console.log('\nDiffie-Hellman (ejemplos de las diapositivas)');

probar('Diapositiva 6: 2^12 mod 13 = 1', potenciaModular(2n, 12n, 13n) == 1n);
let A = llavePublica(2n, 7n, 13n);
let B = llavePublica(2n, 4n, 13n);
probar('Diapositiva 6: A = 2^7 mod 13 = 11', A == 11n);
probar('Diapositiva 6: B = 2^4 mod 13 = 3', B == 3n);
probar('Diapositiva 6: llave de Alice = 3^7 mod 13 = 3', llaveCompartida(B, 7n, 13n) == 3n);
probar('Diapositiva 6: llave de Bob = 11^4 mod 13 = 3', llaveCompartida(A, 4n, 13n) == 3n);

probar('Diapositiva 8: 5^2 mod 23 = 2', potenciaModular(5n, 2n, 23n) == 2n);
probar('Diapositiva 8: 5^11 mod 23 = 22', potenciaModular(5n, 11n, 23n) == 22n);
probar('Diapositiva 8: g = 5 es generador de 23', esGenerador(5n, 23n));
probar('g = 2 no es generador de 23 (2^11 mod 23 = 1)', !esGenerador(2n, 23n));

console.log('\nDiffie-Hellman con P de 2048 bits');

probar('P es el primo de 2048 bits del RFC 3526', P.toString(16) == getDiffieHellman('modp14').getPrime('hex').replace(/^0+/, ''));

let inicio = Date.now();
let g = elegirGenerador(P);
let a = numeroSecreto(P);
let b = numeroSecreto(P);
let publicaAlice = llavePublica(g, a, P);
let publicaBob = llavePublica(g, b, P);
let llaveAlice = llaveCompartida(publicaBob, a, P);
let llaveBob = llaveCompartida(publicaAlice, b, P);
let tiempo = Date.now() - inicio;

probar('G elegido pasa la prueba de la diapositiva 7', esGenerador(g, P));
probar('Alice y Bob calculan la misma llave K', llaveAlice == llaveBob);
probar('La llave K no es igual a ninguna llave publica', llaveAlice != publicaAlice && llaveAlice != publicaBob);

let rechazaUno = false;
try {
  llaveCompartida(1n, a, P);
} catch (e) {
  rechazaUno = true;
}
probar('Rechaza una llave publica falsa (1)', rechazaUno);

console.log('\n  Tiempo del intercambio completo: ' + tiempo + ' ms');

console.log('\nContraseñas, claves e integridad');

let sal = generarSal();
let hashCliente = await hashDeContrasena('MiClave123', sal);
let hashServidor = pbkdf2Sync('MiClave123', Buffer.from(sal, 'hex'), 100000, 32, 'sha256').toString('hex');
probar('El hash PBKDF2 del cliente es igual al de Node', hashCliente == hashServidor);

let retoPrueba = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
let respuestaServidor = createHmac('sha256', Buffer.from(hashServidor, 'hex')).update(retoPrueba).digest('hex');
probar('La respuesta al reto del cliente es la que espera el servidor', respuestaAlReto(hashCliente, retoPrueba) == respuestaServidor);

let clavesAlice = derivarClaves(llaveAlice);
let clavesBob = derivarClaves(llaveBob);
probar('Con la misma K los dos sacan la misma clave AES', aHex(clavesAlice.aes) == aHex(clavesBob.aes));
probar('La clave AES es de 16 bytes (AES-128)', clavesAlice.aes.length == 16);
probar('Los dos ven el mismo codigo de verificacion', clavesAlice.codigo == clavesBob.codigo);

let paquete = crearPaquete('nos vemos a las 5', clavesAlice, 'alice', 'bob', 1);
probar('bob abre el paquete de alice', abrirPaquete(paquete, clavesBob, 'alice', 'bob', 1) == 'nos vemos a las 5');
probar('El paquete no contiene el texto', !JSON.stringify(paquete).includes('nos vemos'));

function seRechaza(funcion: () => void): boolean {
  try {
    funcion();
    return false;
  } catch (e) {
    return true;
  }
}

let alterado = { ...paquete, cifrado: (paquete.cifrado[0] == '0' ? '1' : '0') + paquete.cifrado.substring(1) };
probar('Si cambian una letra del cifrado se rechaza', seRechaza(() => abrirPaquete(alterado, clavesBob, 'alice', 'bob', 1)));
let otroIv = { ...paquete, iv: (paquete.iv[0] == '0' ? '1' : '0') + paquete.iv.substring(1) };
probar('Si cambian el IV se rechaza', seRechaza(() => abrirPaquete(otroIv, clavesBob, 'alice', 'bob', 1)));
probar('Si cambian el numero se rechaza', seRechaza(() => abrirPaquete(paquete, clavesBob, 'alice', 'bob', 2)));
probar('Si cambian el remitente se rechaza', seRechaza(() => abrirPaquete(paquete, clavesBob, 'carlos', 'bob', 1)));
let clavesIntruso = derivarClaves(12345n);
probar('Con otras llaves no se puede abrir', seRechaza(() => abrirPaquete(paquete, clavesIntruso, 'alice', 'bob', 1)));
console.log('\nPasaron: ' + pasaron + '   Fallaron: ' + fallaron + '\n');
if (fallaron > 0) {
  process.exit(1);
}

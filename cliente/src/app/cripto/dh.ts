export const P = BigInt(
  '0x' +
    'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1' +
    '29024E088A67CC74020BBEA63B139B22514A08798E3404DD' +
    'EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245' +
    'E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED' +
    'EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3D' +
    'C2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F' +
    '83655D23DCA3AD961C62F356208552BB9ED529077096966D' +
    '670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B' +
    'E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9' +
    'DE2BCBF6955817183995497CEA956AE515D2261898FA0510' +
    '15728E5A8AACAA68FFFFFFFFFFFFFFFF',
);

export function potenciaModular(base: bigint, exponente: bigint, modulo: bigint): bigint {
  let resultado = 1n;
  base = base % modulo;
  while (exponente > 0n) {
    if (exponente % 2n == 1n) {
      resultado = (resultado * base) % modulo;
    }
    base = (base * base) % modulo;
    exponente = exponente / 2n;
  }
  return resultado;
}

export function numeroAleatorio(minimo: bigint, maximo: bigint): bigint {
  let bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(maximo.toString(16).length / 2) + 8));
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex = hex + bytes[i].toString(16).padStart(2, '0');
  }
  return (BigInt('0x' + hex) % (maximo - minimo + 1n)) + minimo;
}

export function esGenerador(g: bigint, p: bigint): boolean {
  let q = (p - 1n) / 2n;
  if (potenciaModular(g, 2n, p) == 1n) {
    return false;
  }
  if (potenciaModular(g, q, p) == 1n) {
    return false;
  }
  return true;
}

export function elegirGenerador(p: bigint): bigint {
  let g = numeroAleatorio(2n, p - 2n);
  while (!esGenerador(g, p)) {
    g = numeroAleatorio(2n, p - 2n);
  }
  return g;
}

export function numeroSecreto(p: bigint): bigint {
  return numeroAleatorio(2n, p - 2n);
}

export function llavePublica(g: bigint, secreto: bigint, p: bigint): bigint {
  return potenciaModular(g, secreto, p);
}

export function llaveCompartida(publicaDelOtro: bigint, secreto: bigint, p: bigint): bigint {
  if (publicaDelOtro <= 1n || publicaDelOtro >= p - 1n) {
    throw new Error('La llave publica no es valida');
  }
  return potenciaModular(publicaDelOtro, secreto, p);
}

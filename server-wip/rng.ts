import { randomBytes, randomInt } from 'node:crypto';
import type { EngineRandom } from '../engine/types';
import { randomId } from './ids';

export const cryptoRandom: EngineRandom = {
  randomInt: (max) => randomInt(max),
  randomHex: (n) => randomBytes(n).toString('hex'),
  randomId,
};

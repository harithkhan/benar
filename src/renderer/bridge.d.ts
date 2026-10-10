import type { Bridge } from '../shared/bridge';

declare global {
  interface Window {
    benar: Bridge;
  }
}

import { App } from './game/app';
import { findLevel } from './levels';

const root = document.getElementById('app')!;
const app = new App(root);
// Exposed for debugging and automated visual checks from the console.
(window as unknown as { ghostBounce: unknown }).ghostBounce = { app, findLevel };

import path from 'node:path';
import { pathToFileURL } from 'node:url';
export const mod = (p) => import(pathToFileURL(path.join(process.env.REPO ?? process.cwd(), p)).href);

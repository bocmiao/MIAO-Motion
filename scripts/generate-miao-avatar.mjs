import { mkdirSync, writeFileSync } from 'node:fs';
import { generateMiao } from '../src/generate-miao.mjs';
mkdirSync('public/examples',{recursive:true});
writeFileSync('public/examples/miao-cat.vrm',generateMiao());
console.log('已生成原创蒙皮猫咪（与程序内创建器共用生成模块）');

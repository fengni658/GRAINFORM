// IDs1–4 are retained. Color IDs are gameplay values, never array bit masks.
export const COLOR_COUNT=6;
export const PALETTES=Object.freeze({standard:Object.freeze(["","#f0c56a","#49c6b7","#d873a3","#729df5","#f0883d","#a973ee"]),contrast:Object.freeze(["","#ffe07a","#45f8b2","#ff84b4","#71a7ff","#ff9a45","#bc83ff"])});
export const COLOR_NAMES=Object.freeze(['','琥珀色','海青色','玫红色','雾蓝色','暖橙色','紫晶色']);
export const validColor=c=>Number.isInteger(c)&&c>=1&&c<=COLOR_COUNT;

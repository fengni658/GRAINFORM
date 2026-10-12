// IDs1–4 are retained. Color IDs are gameplay values, never array bit masks.
export const COLOR_COUNT=6;
export const PALETTES=Object.freeze({standard:Object.freeze(['','#eac370','#4fc0b3','#d378a3','#789fef','#e88945','#aa79e8']),contrast:Object.freeze(['','#ffe07a','#4df0b0','#fc87b5','#71a7ff','#ff9a45','#bc83ff'])});
export const COLOR_NAMES=Object.freeze(['','琥珀色','海青色','玫红色','雾蓝色','暖橙色','紫晶色']);
export const validColor=c=>Number.isInteger(c)&&c>=1&&c<=COLOR_COUNT;

/** Independent expected-appearance adapter for the frozen CALayerRenderer.
 * It does not rewrite source, contour, geometry, caches, paint order or physics.
 * Pass this wrapper only to renderer.draw(), after any caller/board clip.
 * The frozen renderer's first clip is the material clip; inject exactly there,
 * before its unchanged rim/cache/glyph/selection commands continue.
 * All native methods are bound to their real context (Canvas brand checks).
 */
export function neutralFillAfterMaterialClip(context, { rawCells = false, viewport, onFill = null } = {}) {
  if (!viewport || !['x', 'y', 'width', 'height'].every(k => Number.isFinite(viewport[k]))) {
    throw new TypeError('Provide the unchanged material viewport {x, y, width, height}');
  }
  let clips = 0;
  return new Proxy(context, {
    get(target, key) {
      if (key === 'clip') return (...args) => {
        target.clip(...args);
        if (clips++ !== 0 || rawCells || target.globalCompositeOperation !== 'source-over') return;
        target.fillStyle = '#4b4b4b';
        target.fillRect(viewport.x, viewport.y, viewport.width, viewport.height);
        onFill?.();
      };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, key, value) { return Reflect.set(target, key, value, target); }
  });
}

/** Convenient drop-in constructor for existing frozen-vs-candidate matrices.
 * Example: const Oracle = neutralFillOracleClass(Frozen, viewport);
 * Existing drawSelection-only calls deliberately remain entirely unchanged.
 */
export function neutralFillOracleClass(FrozenRenderer, viewport) {
  return class FrozenWithExpectedNeutralFill extends FrozenRenderer {
    draw(context, selection = null) {
      return super.draw(neutralFillAfterMaterialClip(context, { rawCells: this.rawCells, viewport }), selection);
    }
  };
}

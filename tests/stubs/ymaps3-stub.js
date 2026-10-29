// ЗАГЛУШКА JS API v3 только для автотестов. На сайт не попадает.
// Повторяет минимальный набор классов, которые использует js/map.js.
(() => {
  const calls = { markersAdded: 0, updates: [], imports: [], features: 0 };
  const VIEW = { w: 37.30, e: 37.95, s: 55.55, n: 55.92 };

  class Entity {
    constructor(props = {}, el) { this.props = props; this.el = el || null; this.children = []; }
    addChild(c) { this.children.push(c); return this; }
    removeChild(c) { this.children = this.children.filter((x) => x !== c); if (c.el) c.el.remove(); return this; }
    update(p) { Object.assign(this.props, p); }
  }
  class YMapMarker extends Entity {}
  class YMapFeature extends Entity {}

  class YMap extends Entity {
    constructor(container, props) {
      super(props);
      this.root = document.createElement('div');
      this.root.className = 'stub-map';
      this.root.style.cssText = 'position:absolute;inset:0;background:repeating-linear-gradient(45deg,#dfe6ee 0 12px,#e9eef4 12px 24px)';
      const label = document.createElement('div');
      label.textContent = 'STUB MAP © Яндекс';
      label.style.cssText = 'position:absolute;right:6px;bottom:4px;font:11px sans-serif;color:#333';
      this.root.appendChild(label);
      container.appendChild(this.root);
      this.center = props.location.center;
      this.zoom = props.location.zoom;
    }
    addChild(c) {
      super.addChild(c);
      if (c instanceof YMapMarker && c.el) {
        const [lon, lat] = c.props.coordinates;
        c.el.style.position = 'absolute';
        c.el.style.left = ((lon - VIEW.w) / (VIEW.e - VIEW.w)) * 100 + '%';
        c.el.style.top = ((VIEW.n - lat) / (VIEW.n - VIEW.s)) * 100 + '%';
        this.root.appendChild(c.el);
        calls.markersAdded++;
      }
      if (c instanceof YMapFeature) calls.features++;
      return this;
    }
    update(p) {
      calls.updates.push(p);
      if (p.location && p.location.center) this.center = p.location.center;
      if (p.location && p.location.zoom) this.zoom = p.location.zoom;
    }
    get bounds() { return [[37.50, 55.80], [37.70, 55.70]]; }
  }

  window.ymaps3 = {
    ready: Promise.resolve(),
    YMap,
    YMapDefaultSchemeLayer: Entity,
    YMapDefaultFeaturesLayer: Entity,
    YMapControls: Entity,
    YMapMarker,
    YMapFeature,
    import: (name) => { calls.imports.push(name); return Promise.reject(new Error('stub: module ' + name + ' is not available')); },
    __calls: calls,
  };
})();

(function () {
  'use strict';
  const key = '__d408PassiveFlowInput';
  if (window[key]) throw Error('D408 passive flow observer already installed');
  const rows = [], ids = new WeakMap(), limit = 1536;
  let nextId = 1, dropped = 0, selector = '', watched = null, disposed = false;
  const id = node => { if (!node || typeof node !== 'object') return null; if (!ids.has(node)) ids.set(node, nextId++); return ids.get(node); };
  const node = value => value && value.nodeType === 1 ? {
    nodeId: id(value), tag: value.tagName, action: value.getAttribute('data-action'),
    recordId: value.getAttribute('data-id'), name: value.getAttribute('name'),
    connected: value.isConnected, disabled: !!value.disabled
  } : value ? {nodeId: id(value), nodeType: value.nodeType} : null;
  const viewport = () => {
    const v = window.visualViewport;
    return {innerWidth, innerHeight, devicePixelRatio, scrollX, scrollY,
      visual: v ? {width: v.width, height: v.height, offsetLeft: v.offsetLeft, offsetTop: v.offsetTop, scale: v.scale} : null};
  };
  const target = () => {
    const current = selector ? document.querySelector(selector) : null, r = current?.getBoundingClientRect();
    return {selector, watched: node(watched), current: node(current), sameNode: !!current && current === watched,
      rect: r ? {left: r.left, top: r.top, right: r.right, bottom: r.bottom} : null,
      centerHit: r ? node(document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)) : null};
  };
  const add = (kind, extra) => {
    if (disposed) return;
    if (rows.length >= limit) { dropped++; return; }
    rows.push({kind, wallMillis: Date.now(), performanceMillis: performance.now(),
      documentHasFocus: document.hasFocus(), activeElement: node(document.activeElement), ...extra});
  };
  const points = list => Array.from(list || []).slice(0, 4).map(t => ({identifier: t.identifier,
    clientX: t.clientX, clientY: t.clientY, screenX: t.screenX, screenY: t.screenY}));
  const capture = event => {
    try { add('dom-event', {type: event.type, observedAt: 'window-capture', trusted: event.isTrusted, eventTimeStamp: event.timeStamp,
      eventPhase: event.eventPhase, defaultPrevented: event.defaultPrevented, cancelable: event.cancelable,
      target: node(event.target), clientX: event.clientX ?? null, clientY: event.clientY ?? null,
      screenX: event.screenX ?? null, screenY: event.screenY ?? null,
      pointerId: event.pointerId ?? null, pointerType: event.pointerType ?? null,
      button: event.button ?? null, buttons: event.buttons ?? null,
      touches: points(event.touches), changedTouches: points(event.changedTouches),
      watchedTarget: target(), viewport: viewport()}); }
    catch (error) { add('observer-error', {error: String(error)}); }
  };
  const types = ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel',
    'mousedown', 'mouseup', 'click', 'focusin', 'focusout'];
  types.forEach(type => window.addEventListener(type, capture, {capture: true, passive: true}));
  const observer = new MutationObserver(records => {
    if (!selector) return;
    try {
      const current = document.querySelector(selector);
      const related = records.filter(r => r.target === watched || r.target === current ||
        (r.type === 'childList' && Array.from(r.removedNodes).some(n => n === watched || n.contains?.(watched))) ||
        (r.type === 'childList' && Array.from(r.addedNodes).some(n => n === current || n.contains?.(current))));
      if (related.length) add('target-mutation', {count: related.length,
        records: related.slice(0, 12).map(r => ({type: r.type, attribute: r.attributeName,
          target: node(r.target), removed: Array.from(r.removedNodes).slice(0, 8).map(node),
          added: Array.from(r.addedNodes).slice(0, 8).map(node)})), watchedTarget: target()});
    } catch (error) { add('observer-error', {error: String(error)}); }
  });
  observer.observe(document.documentElement, {subtree: true, childList: true, attributes: true,
    attributeFilter: ['disabled', 'class', 'style', 'hidden', 'aria-disabled']});
  window[key] = {
    sample(phase, nextSelector) {
      if (nextSelector !== null && nextSelector !== undefined) {
        selector = nextSelector; watched = selector ? document.querySelector(selector) : null;
      }
      add('sample', {phase, watchedTarget: target(), viewport: viewport()});
      return {phase, rows: rows.length, dropped};
    },
    finish() {
      observer.disconnect(); types.forEach(type => window.removeEventListener(type, capture, true));
      try {
        add('segment-finish', {watchedTarget: target(), viewport: viewport()});
        return {limit, rows, dropped, listenersRemoved: true, observerDisconnected: true};
      } finally { disposed = true; delete window[key]; }
    }
  };
  add('segment-begin', {viewport: viewport()});
  return {installed: true, limit};
})()

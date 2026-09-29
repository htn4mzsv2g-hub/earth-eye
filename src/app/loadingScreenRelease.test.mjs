import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ensureLoaderReleased,
  installLoaderReleaseGuards,
  loaderInterceptsPointer,
  releaseLoadingScreen,
} from './loadingScreenRelease.js';

function element(tag, className = '') {
  const attrs = new Map();
  const el = {
    tagName: tag.toUpperCase(),
    id: '',
    className,
    children: [],
    style: {},
    inert: false,
    hidden: false,
    parentElement: null,
    classList: {
      _set: new Set(className.split(/\s+/).filter(Boolean)),
      add(...names) {
        for (const name of names) this._set.add(name);
        el.className = [...this._set].join(' ');
      },
      contains(name) {
        return this._set.has(name);
      },
      remove(...names) {
        for (const name of names) this._set.delete(name);
        el.className = [...this._set].join(' ');
      },
    },
    removeAttribute(key) {
      attrs.delete(key);
      if (key === 'id') el.id = '';
    },
    replaceChild(next, prev) {
      const index = this.children.indexOf(prev);
      if (index < 0) return null;
      next.parentElement = this;
      prev.parentElement = null;
      this.children[index] = next;
      return prev;
    },
    setAttribute(key, value) {
      attrs.set(key, String(value));
    },
    getAttribute(key) {
      return attrs.has(key) ? attrs.get(key) : null;
    },
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    },
    querySelector(sel) {
      const walk = (node) => {
        for (const child of node.children) {
          if (sel === '.loader-content' && child.classList.contains('loader-content'))
            return child;
          if (sel === '.loader-status' && child.classList.contains('loader-status'))
            return child;
          const nested = walk(child);
          if (nested) return nested;
        }
        return null;
      };
      return walk(this);
    },
    getAnimations() {
      return [{ canceled: false, cancel() { this.canceled = true; } }];
    },
  };
  return el;
}

function loaderFixture() {
  const screen = element('div');
  screen.id = 'loading-screen';
  const content = element('div', 'loader-content');
  content.style.pointerEvents = 'auto';
  const word = element('h2', 'loader-wordmark');
  content.appendChild(word);
  const status = element('p', 'loader-status');
  screen.appendChild(content);
  screen.appendChild(status);
  return { screen, content };
}

test('class-only hide still leaves loader-content as the center hit target', () => {
  const { screen } = loaderFixture();
  screen.classList.add('hidden');
  screen.style.pointerEvents = 'none';
  assert.equal(loaderInterceptsPointer(screen), true);
  assert.equal(screen.querySelector('.loader-content').style.pointerEvents, 'auto');
});

test('v64 computed style still intercepts until the live node is released', () => {
  const { screen } = loaderFixture();
  const computed = {
    display: 'flex',
    visibility: 'visible',
    pointerEvents: 'auto',
    opacity: '1',
  };
  assert.equal(loaderInterceptsPointer(screen, computed), true);
  const doc = {
    getElementById: (id) => (id === 'loading-screen' ? screen : null),
    defaultView: { getComputedStyle: () => computed },
  };
  assert.equal(ensureLoaderReleased(doc), true);
  assert.equal(screen.style.display, 'none');
  assert.equal(screen.getAttribute('data-ee-loader-released'), '1');
  assert.equal(loaderInterceptsPointer(screen), false);
});

test('release removes the loader from hit testing even when a child forces pointer-events', () => {
  const { screen, content } = loaderFixture();
  assert.equal(loaderInterceptsPointer(screen), true);
  releaseLoadingScreen(screen);
  assert.equal(screen.classList.contains('hidden'), true);
  assert.equal(screen.inert, true);
  assert.equal(screen.getAttribute('data-ee-loader-released'), '1');
  assert.equal(screen.style.display, 'none');
  assert.equal(screen.style.visibility, 'hidden');
  assert.equal(screen.style.pointerEvents, 'none');
  assert.equal(content.style.pointerEvents, 'none');
  assert.equal(loaderInterceptsPointer(screen), false);
});

test('a stamped loader whose styles are cleared is replaced with an empty inert node', () => {
  const { screen } = loaderFixture();
  const parent = element('div');
  parent.appendChild(screen);
  let current = screen;
  const computed = {
    display: 'flex',
    visibility: 'visible',
    pointerEvents: 'auto',
    opacity: '1',
  };
  const doc = {
    getElementById: (id) => (id === 'loading-screen' && current?.id === 'loading-screen' ? current : null),
    createElement: () => element('div'),
    defaultView: { getComputedStyle: () => computed },
  };
  const originalReplace = parent.replaceChild.bind(parent);
  parent.replaceChild = (next, prev) => {
    const removed = originalReplace(next, prev);
    if (prev === current) current = next;
    return removed;
  };
  releaseLoadingScreen(screen, { reason: 'cap', now: () => 1700000000000 });
  assert.equal(screen.getAttribute('data-ee-loader-released'), '1');
  assert.equal(screen.getAttribute('data-ee-loader-released-at'), '1700000000000');
  assert.equal(globalThis.__eeLoaderRelease.reason, 'cap');
  screen.classList.remove('hidden');
  delete screen.style.display;
  delete screen.style.visibility;
  delete screen.style.pointerEvents;
  assert.equal(loaderInterceptsPointer(screen, computed), true);
  assert.equal(ensureLoaderReleased(doc), true);
  assert.notEqual(current, screen);
  assert.equal(current.id, 'loading-screen');
  assert.equal(current.getAttribute('data-ee-loader-detached'), '1');
  assert.equal(current.getAttribute('data-ee-loader-released-at'), '1700000000000');
  assert.equal(current.inert, true);
  assert.equal(current.querySelector('.loader-content'), null);
  assert.equal(loaderInterceptsPointer(current, computed), false);
  assert.equal(screen.id, '');
});

test('pageshow, visibility, and focus re-assert a cleared loader release', () => {
  const { screen } = loaderFixture();
  const parent = element('div');
  parent.appendChild(screen);
  let current = screen;
  const listeners = new Map();
  const doc = {
    __eeLoaderGuards: false,
    getElementById: (id) => (id === 'loading-screen' && current?.id === 'loading-screen' ? current : null),
    createElement: () => element('div'),
    defaultView: { getComputedStyle: () => ({ display: 'flex', visibility: 'visible', pointerEvents: 'auto', opacity: '1' }) },
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
  const winListeners = new Map();
  const win = {
    addEventListener(type, fn) {
      winListeners.set(type, fn);
    },
    removeEventListener(type) {
      winListeners.delete(type);
    },
  };
  const originalReplace = parent.replaceChild.bind(parent);
  parent.replaceChild = (next, prev) => {
    const removed = originalReplace(next, prev);
    if (prev === current) current = next;
    return removed;
  };
  releaseLoadingScreen(screen, { now: () => 42 });
  delete screen.style.display;
  delete screen.style.visibility;
  delete screen.style.pointerEvents;
  screen.classList.remove('hidden');
  const stop = installLoaderReleaseGuards(doc, win);
  assert.equal(typeof listeners.get('visibilitychange'), 'function');
  assert.equal(typeof winListeners.get('pageshow'), 'function');
  assert.equal(typeof winListeners.get('focus'), 'function');
  winListeners.get('pageshow')();
  assert.equal(current.getAttribute('data-ee-loader-detached'), '1');
  assert.equal(current.querySelector('.loader-content'), null);
  stop();
  assert.equal(listeners.has('visibilitychange'), false);
  assert.equal(winListeners.has('focus'), false);
});

test('loading-screen CSS takes the hidden loader out of hit testing immediately', () => {
  const css = readFileSync(
    new URL('../ui/styles/controls.css', import.meta.url),
    'utf8',
  );
  const screen = css.match(/#loading-screen\s*\{[^}]*\}/);
  assert.ok(screen, 'missing #loading-screen rule');
  assert.doesNotMatch(screen[0], /transition:[^;]*visibility/);
  assert.match(css, /#loading-screen\.hidden\s*\{[^}]*display:\s*none\s*!important/);
  assert.match(css, /#loading-screen\.hidden\s*,\s*#loading-screen\.hidden \*\s*\{[^}]*pointer-events:\s*none\s*!important/);
  assert.match(css, /visibility:\s*hidden\s*!important/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
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

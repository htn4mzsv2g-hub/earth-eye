import { readFileSync } from 'node:fs';

export const APPLICATION_TEMPLATES = Object.freeze([
  'scene-chrome',
  'cockpit',
  'display-controls',
  'command-dock',
  'layer-panels',
  'context',
  'welcome',
  'provider-settings',
  'hud-loading',
]);
const allowed = new Set(APPLICATION_TEMPLATES);

/** Expand only known component templates; markers cannot name filesystem paths. */
export function expandApplicationHtml(html) {
  return html.replace(
    /^[ \t]*<!-- gev:template ([^\s]+) -->\r?\n?/gm,
    (_, name) => {
      if (!allowed.has(name))
        throw new Error(`Unknown application template: ${name}`);
      return readFileSync(
        new URL(`../src/ui/templates/${name}.html`, import.meta.url),
        'utf8',
      );
    },
  );
}

/** Inject public build ids into <head> so owners can verify tip without DevTools. */
export function injectBuildMeta(html) {
  const buildId = process.env.EE_BUILD_ID || 'dev';
  const gitSha = process.env.EE_GIT_SHA || 'unknown';
  const tags = [
    `<meta name="ee-build-id" content="${String(buildId).replace(/"/g, '')}" />`,
    `<meta name="ee-git-sha" content="${String(gitSha).replace(/"/g, '')}" />`,
  ].join('\n  ');
  if (html.includes('name="ee-build-id"')) return html;
  return html.replace(/<head([^>]*)>/i, (m) => `${m}\n  ${tags}`);
}

/** Assemble static application markup before Vite processes scripts and assets. */
export function applicationHtmlPlugin() {
  return {
    name: 'application-component-templates',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return injectBuildMeta(expandApplicationHtml(html));
      },
    },
  };
}

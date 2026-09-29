/**
 * Bundled 3D model credits, copied exactly from public/models/README.md (the
 * repository's asset record). All CC BY 4.0: credit, licence link and a
 * "modified" notice must be visible to users, so the Attribution & Licenses
 * panel renders this list. src/atlas/assetCredits.test.mjs checks it against
 * the README row by row, so the two cannot drift.
 */
const CC_BY_4 = Object.freeze({
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
});

const model = (file, title, author, authorUrl, sourceUrl, modification) =>
  Object.freeze({
    file,
    title,
    author,
    authorUrl,
    sourceUrl,
    ...CC_BY_4,
    modified: true,
    modification,
  });

export const MODEL_CREDITS = Object.freeze([
  model(
    'airplane.glb',
    'boeing 747',
    'zairiq-123',
    'https://sketchfab.com/zairiq-123',
    'https://sketchfab.com/3d-models/boeing-747-9b16672038ba48f98e6d80a159044ed9',
    'Substantially modified and optimized (geometry/material simplification, orientation and scale baked).',
  ),
  model(
    'jet.glb',
    'Private Jet',
    'Nick the Name',
    'https://sketchfab.com/Nick_The_Name',
    'https://sketchfab.com/3d-models/private-jet-cbdd1de6ced9461e950eafaa302cc82b',
    'Repackaged as glTF binary; transforms baked, meter scale, re-oriented. Materials preserved.',
  ),
  model(
    'ship.glb',
    'Low Poly Cargo Ship',
    'Javier_Fernandez',
    'https://sketchfab.com/Javier.Fernandez',
    'https://sketchfab.com/3d-models/low-poly-cargo-ship-4c22cbaf01c1427f8ab60b3a07b1b32c',
    'Optimized and repackaged as a glTF binary.',
  ),
  model(
    'bell206.glb',
    'Bell 206 JetRanger',
    'terran4627',
    'https://sketchfab.com/terran4627',
    'https://sketchfab.com/3d-models/bell-206-jetranger-d2f7ba1d671549d4b26aaf834139a1dd',
    'Optimized: geometry/material simplification, 256 px WebP textures, orientation/scale baked.',
  ),
  model(
    'c172.glb',
    'Cessna 172',
    'e737',
    'https://sketchfab.com/e0057537',
    'https://sketchfab.com/3d-models/cessna-172-64cddaee5aff470682659a8c08525046',
    'Optimized: geometry/material simplification, 256 px WebP textures, orientation/scale baked.',
  ),
  model(
    'citation2.glb',
    '1990 Cessna Citation, Texture Detailed, Exterior',
    'BlenderCommunityHead',
    'https://sketchfab.com/aboodgoudagad',
    'https://sketchfab.com/3d-models/1990-cessna-citation-texture-detailed-exterior-a78839624fe64900a8352cb23462350a',
    'Optimized: geometry/material simplification, 256 px WebP textures, orientation/scale baked.',
  ),
  model(
    'mq9.glb',
    'MQ-9',
    'IProZenoN',
    'https://sketchfab.com/IProZenoN',
    'https://sketchfab.com/3d-models/mq-9-fabe963feb354c5584b51f9c470c3f7e',
    'Optimized: geometry/material simplification, 256 px WebP textures, orientation/scale baked.',
  ),
  model(
    'b789.glb',
    'Boeing 787-9',
    'Nobilis 2',
    'https://sketchfab.com/nobilishornet2',
    'https://sketchfab.com/3d-models/boeing-787-9-b6711e2e698e4e469675c1154a50b7a3',
    'Optimized: geometry/material simplification, 256 px WebP textures, orientation/scale baked.',
  ),
  model(
    'atr72.glb',
    'ATR 72 - 600',
    'Oyan3D',
    'https://sketchfab.com/oyan3D',
    'https://sketchfab.com/3d-models/atr-72-600-1e1a7186f7444d288675262fcee44744',
    'Optimized: textures removed, dominant colours baked into PBR factors, orientation/scale baked.',
  ),
]);

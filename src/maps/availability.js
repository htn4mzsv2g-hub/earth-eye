import { keySetupRequirement } from '../keySetupCore.mjs';
/**
 * Why Google 3D is unavailable — tooltip / toast must recommend the RIGHT fix.
 * @param {boolean} hasCredentials
 * @returns {string}
 */
export function photorealUnavailableReason(hasCredentials) {
  if (hasCredentials)
    return "Google Photorealistic 3D unavailable — check Map Tiles API enablement, key restrictions, ion token, quota, or network";
  return (
    'Google Photorealistic 3D OFF — ' +
    keySetupRequirement('google-maps') +
    ' (direct) or ' +
    keySetupRequirement('cesium-ion') +
    ' (ion-hosted Google 3D). Esri satellite stays active until then.'
  );
}

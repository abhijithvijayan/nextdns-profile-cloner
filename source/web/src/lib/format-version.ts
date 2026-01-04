import {VERSION, GIT_HASH, BUILD_TIME} from './version';

export function getFormattedVersion(): string {
  return `v${VERSION} (${GIT_HASH}) • ${BUILD_TIME} UTC`;
}

export {VERSION, GIT_HASH, BUILD_TIME};

import {VERSION, GIT_HASH, BUILD_TIME} from './version';

export function getFormattedVersion(): string {
  return `Version: ${VERSION}+${GIT_HASH} · Built on ${BUILD_TIME}`;
}

export {VERSION, GIT_HASH, BUILD_TIME};

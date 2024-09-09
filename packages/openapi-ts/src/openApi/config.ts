import type { Config } from './common/interfaces/config';

let _config: Config;

export const getConfig = () => _config;

export const setConfig = (config: Config) => {
  _config = config;
  return getConfig();
};

/**
 * GuruCMS desktop bootstrap — exposes cloud API URL to the bundled webapp.
 */
const { contextBridge } = require('electron');

const cloudUrl = (process.env.PATHGURU_CLOUD_URL || 'https://pathguru-publishers.onrender.com').replace(/\/$/, '');
const defaultProduct = process.env.PATHGURU_PRODUCT || 'digifusion';

contextBridge.exposeInMainWorld('__PATHGURU_DESKTOP__', {
  isDesktop:         true,
  defaultBackendUrl: cloudUrl,
  cloudUrl,
  defaultProduct,
  skipLauncher:      true,
  appName:           'GuruCMS',
});

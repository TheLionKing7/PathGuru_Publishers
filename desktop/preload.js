/**
 * Desktop bootstrap — exposes cloud backend URL to the webapp launcher.
 */
const { contextBridge } = require('electron');

const cloudUrl = (process.env.PATHGURU_CLOUD_URL || 'https://pathguru-publishers.onrender.com').replace(/\/$/, '');

contextBridge.exposeInMainWorld('__PATHGURU_DESKTOP__', {
  isDesktop:         true,
  defaultBackendUrl: cloudUrl,
  cloudUrl,
});

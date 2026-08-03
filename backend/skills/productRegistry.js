/**
 * DigiFusion Command — product registry (CMS + agents + shop).
 * KDP book pipeline: see Frastructure/TheScribe (separate deploy).
 */

export function isPublisherEnabled() {
  return false;
}

export const PRODUCTS = {
  digifusion: {
    id:            'digifusion',
    name:          'DigiFusion Command',
    shortName:     'DigiFusion',
    tagline:       'CMS, agent network & firm operations',
    departments:   ['blogroom', 'intelligence', 'products', 'network', 'analytics', 'frictioniq'],
    defaultDept:   'blogroom',
    defaultTab:    'blog',
    commercialSku: false,
    apiScopes:     ['cms:write', 'agents:admin', 'shop:admin', 'analytics:read', 'frictioniq:admin'],
  },
  full: {
    id:            'full',
    name:          'Full Command',
    shortName:     'Full',
    tagline:       'All Command departments',
    departments:   ['blogroom', 'intelligence', 'products', 'network', 'analytics', 'frictioniq'],
    defaultDept:   'blogroom',
    defaultTab:    'blog',
    commercialSku: false,
    apiScopes:     ['*'],
  },
};

export function getProduct(id) {
  return PRODUCTS[id] || null;
}

export function listProducts({ includeFull = true } = {}) {
  return Object.values(PRODUCTS).filter((p) => includeFull || p.id !== 'full');
}

export function departmentAllowed(productId, deptId) {
  const product = getProduct(productId);
  if (!product) return false;
  return product.departments.includes(deptId);
}

export function buildPlatformConfig() {
  const cloudUrl = (process.env.PATHGURU_PUBLIC_URL || 'https://pathguru-publishers.onrender.com').replace(/\/$/, '');
  const digifusionSite = (process.env.DIGIFUSION_API_URL || 'https://www.digitafusion.com').replace(/\/$/, '');

  return {
    version:           '3.0',
    defaultBackendUrl: cloudUrl,
    digifusionSiteUrl: digifusionSite,
    defaultProduct:    'digifusion',
    publisherEnabled:  false,
    publisherRepo:     'Frastructure/TheScribe',
    products:          listProducts({ includeFull: true }).map((p) => ({
      id:            p.id,
      name:          p.name,
      shortName:     p.shortName,
      tagline:       p.tagline,
      departments:   p.departments,
      defaultDept:   p.defaultDept,
      defaultTab:    p.defaultTab,
      commercialSku: p.commercialSku,
    })),
    hybrid: {
      mode:        'cloud-primary',
      description: 'Desktop client uses the cloud API; agents and CMS ops continue when desktop is off.',
    },
    commercial: {
      publisherDeployable: false,
      note: 'KDP Publisher runs as The Scribe (separate service). This host is DigiFusion Command only.',
    },
  };
}

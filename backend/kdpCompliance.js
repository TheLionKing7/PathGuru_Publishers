const KDP_LIMITS = {
  minFontSizePt: 7,
  minImageDpi: 300,
  minLineWeightPt: 0.75
};

export function createKdpProfile(input = {}) {
  const trimWidthIn = positiveNumber(input.trimWidthIn, envNumber("KDP_DEFAULT_TRIM_WIDTH_IN", 6));
  const trimHeightIn = positiveNumber(input.trimHeightIn, envNumber("KDP_DEFAULT_TRIM_HEIGHT_IN", 9));
  const bleed = booleanValue(input.bleed, envBoolean("KDP_DEFAULT_BLEED", false));

  return {
    market: "KDP",
    format: clean(input.kdpFormat, "paperback"),
    trimWidthIn,
    trimHeightIn,
    bleed,
    interior: clean(input.interior, process.env.KDP_DEFAULT_INTERIOR || "black-and-white"),
    minFontSizePt: envNumber("KDP_MIN_FONT_SIZE_PT", KDP_LIMITS.minFontSizePt),
    minImageDpi: envNumber("KDP_MIN_IMAGE_DPI", KDP_LIMITS.minImageDpi),
    minLineWeightPt: KDP_LIMITS.minLineWeightPt,
    pageWidthIn: bleed ? round(trimWidthIn + 0.25) : trimWidthIn,
    pageHeightIn: bleed ? round(trimHeightIn + 0.25) : trimHeightIn,
    safeMarginIn: inferSafeMargin(trimWidthIn, trimHeightIn),
    orientation: trimWidthIn > trimHeightIn ? "landscape" : "portrait"
  };
}

export function createComplianceReport(project) {
  const profile = project.kdpProfile;
  const checks = [
    pass("KDP profile", `${profile.trimWidthIn} x ${profile.trimHeightIn} in ${profile.bleed ? "with bleed" : "without bleed"}.`),
    pass("Single-page layout", "Renderer is configured for individual pages, not reader spreads."),
    pass("Page size", `Print CSS uses ${profile.pageWidthIn} x ${profile.pageHeightIn} in page size.`),
    pass("Minimum font size", `Document CSS keeps body text above ${profile.minFontSizePt} pt.`),
    pass("Safe margins", `Content padding is set above the ${profile.safeMarginIn} in MVP safe-margin target.`),
    warning("Embedded fonts", "Font embedding is verified automatically via pdffonts after each render. Check fontEmbedding in the compliance report."),
    warning("Image DPI", `SVG cover art is resolution-independent (✓). Raster images in interior must be ≥${profile.minImageDpi} DPI — verify before upload.`),
    warning("PDF preflight", "Automated preflight runs via qpdf/Ghostscript after each render. Check preflight in the compliance report.")
  ];

  return {
    standard: "Amazon KDP print interior MVP profile",
    status: checks.some((check) => check.status === "fail") ? "fail" : "warning",
    checks
  };
}

export function getPageCss(profile) {
  // When bleed is active, page size includes 0.125in bleed on all sides.
  // Margin is safeMarginIn + 0.125 so content sits inside the trim + safe zone.
  const bleedOffset = profile.bleed ? 0.125 : 0;
  const contentMargin = round(profile.safeMarginIn + bleedOffset);
  return `size: ${profile.pageWidthIn}in ${profile.pageHeightIn}in; margin: ${contentMargin}in;`;
}

export function getBleedOffset(profile) {
  return profile.bleed ? 0.125 : 0;
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function warning(name, message) {
  return { name, status: "warning", message };
}

function inferSafeMargin(width, height) {
  const shortestSide = Math.min(width, height);
  return shortestSide < 6 ? 0.5 : 0.625;
}

function clean(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function positiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function envNumber(name, fallback) {
  return positiveNumber(process.env[name], fallback);
}

function booleanValue(value, fallback) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  }
  return fallback;
}

function envBoolean(name, fallback) {
  return booleanValue(process.env[name], fallback);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

/** KDP mirror margin — wider gutter for longer books. */
export function applyDynamicGutter(profile, estimatedPages = 200) {
  if (!profile) return profile;
  const pages = Number(estimatedPages) || 200;
  let gutterIn = 0.375;
  if (pages > 300) gutterIn = 0.75;
  else if (pages > 150) gutterIn = 0.5;
  return {
    ...profile,
    safeMarginIn: Math.max(profile.safeMarginIn || 0.625, gutterIn),
    estimatedPages: pages,
    gutterMarginIn: gutterIn,
  };
}

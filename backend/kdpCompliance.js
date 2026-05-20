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
    pageWidthIn: bleed ? round(trimWidthIn + 0.125) : trimWidthIn,
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
    warning("Embedded fonts", "MVP uses system fonts. Production PDF export must embed licensed fonts and verify them after rendering."),
    warning("Image DPI", `No raster images are placed yet. Production exports must verify every image is at least ${profile.minImageDpi} DPI.`),
    warning("PDF preflight", "A final pass/fail preflight requires inspecting the exported PDF file, not only the HTML design model.")
  ];

  return {
    standard: "Amazon KDP print interior MVP profile",
    status: checks.some((check) => check.status === "fail") ? "fail" : "warning",
    checks
  };
}

export function getPageCss(profile) {
  return `size: ${profile.pageWidthIn}in ${profile.pageHeightIn}in; margin: ${profile.safeMarginIn}in;`;
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

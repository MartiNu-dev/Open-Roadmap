export function getLevelLabel(t, level) {
  return level ? t(`roadmaps:levels.${level}`) : t("roadmaps:levels.none");
}

export function getRoadmapStatusLabel(t, status) {
  return t(`admin:roadmapStatus.${status}`);
}

export function getProgressStatusLabel(t, status) {
  return t(`roadmaps:blockPanel.status.${status}`);
}

export function getResourceKindLabel(t, kind) {
  return t(`roadmaps:blockPanel.resourceKinds.${kind}`);
}

export function getBlockStyleLabel(t, style) {
  return t(`roadmaps:blockPanel.styles.${style}`);
}

export function getPositionLabel(t, position) {
  return t(`roadmaps:blockPanel.positions.${position}`);
}

export function getAlignmentLabel(t, align) {
  return t(`roadmaps:blockPanel.aligns.${align}`);
}

export function getCanvasFontSizeLabel(t, fontSize) {
  return t(`roadmaps:blockPanel.fontSizes.${fontSize}`);
}

export function getRoleLabel(t, role) {
  return t(`common:roles.${role}`);
}

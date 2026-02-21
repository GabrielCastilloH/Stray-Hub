/**
 * Stray Hub color palette.
 * Names are semantic/role-based so swapping a color never requires renaming references.
 */

export const Colors = {
  // --- Brand core ---
  primary:        '#124170', // deep navy — main brand color
  primaryDark:    '#0C2E52', // darker shade for pressed states / headers
  primaryLight:   '#1E5A96', // lighter tint for highlights

  secondary:      '#26667F', // teal — supporting brand color
  secondaryLight: '#3A849E', // lighter tint

  // --- Accent ---
  accent:         '#67C090', // fresh green — CTAs, success, active indicators
  accentLight:    '#8DD4A8', // softer green for backgrounds / chips
  accentSubtle:   '#DDF4E7', // near-white mint — page tints, card fills

  // --- Neutrals ---
  white:          '#FFFFFF', // pure white
  background:     '#F8FAFB', // near-white surface
  surface:        '#FFFFFF', // card / modal surface
  surfaceMuted:   '#EFF3F6', // slightly grey surface for inactive areas
  border:         '#D1DDE6', // dividers, input borders

  // --- Text ---
  textPrimary:    '#0F2033', // almost-black body text
  textSecondary:  '#4A6275', // muted supporting text
  textDisabled:   '#9BB0BE', // disabled / placeholder text
  textOnDark:     '#FFFFFF', // text sitting on primary/secondary backgrounds

  // --- Semantic states ---
  success:        '#67C090', // same as accent
  warning:        '#F5A623', // amber for caution states
  error:          '#D94F4F', // red for errors / destructive actions
  info:           '#26667F', // same as secondary
} as const;

export type ColorKey = keyof typeof Colors;

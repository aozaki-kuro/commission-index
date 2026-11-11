export const COMMISSION_IMAGE_WIDTH = 1280
export const COMMISSION_IMAGE_SIZES = '(max-width: 768px) 92vw, 640px'
// Shared by the inline <img> and the LCP preload so the preload describes exactly the image it hints.
// 1080 serves a 390px phone at DPR 3 (92vw x 3 = ~1077px), which would otherwise fetch the 1280w file.
export const COMMISSION_INLINE_IMAGE_WIDTHS = [768, 1080, 1280]

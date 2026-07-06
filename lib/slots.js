const SECTION_SLOTS = {
  hero: { prefix: 'photos/hero/', label: '히어로 배경 (여러 장, 자동 순환)' },
  'category-gov': { prefix: 'photos/category-gov/', label: '관공서 배경' },
  'category-festival': { prefix: 'photos/category-festival/', label: '행사·축제 배경' },
  'category-newyear': { prefix: 'photos/category-newyear/', label: '신년회 배경' },
};

const PRODUCT_SLOT_RE = /^product-[a-z0-9-]+$/;

function isValidSlot(slot) {
  return Boolean(slot) && (Boolean(SECTION_SLOTS[slot]) || PRODUCT_SLOT_RE.test(slot));
}

function prefixForSlot(slot) {
  if (SECTION_SLOTS[slot]) return SECTION_SLOTS[slot].prefix;
  if (PRODUCT_SLOT_RE.test(slot)) return `photos/${slot}/`;
  return null;
}

module.exports = { SECTION_SLOTS, isValidSlot, prefixForSlot };

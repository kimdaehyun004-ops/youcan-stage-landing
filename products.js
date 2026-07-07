window.CATEGORY_LABELS = {
  'category-gov': '관공서',
  'category-festival': '행사·축제',
  'category-newyear': '신년회',
  rental: '렌탈상품',
};

window.PRODUCTS = [
  // 관공서 전용 (렌탈상품에 없는 품목)
  // (현재 전부 렌탈상품과 겹쳐 별도 항목 없음)

  // 행사·축제 전용 (렌탈상품에 없는 품목)
  {
    id: 'festival-effect',
    category: 'category-festival',
    caseTypes: ['category-festival'],
    name: '특수효과',
    desc: '컨페티·스파크 등 특수효과로 축제의 하이라이트 순간을 만듭니다.',
  },

  // 신년회 전용 (렌탈상품에 없는 품목)
  // (현재 전부 렌탈상품과 겹쳐 별도 항목 없음)

  // 렌탈상품 — 전체 렌탈 품목 카탈로그
  // caseTypes가 있으면 해당 홈페이지 케이스 배너에도 같은 사진으로 함께 노출됩니다.
  { id: 'rp-truss-20', category: 'rental', name: '20각 트러스', desc: '20각 규격의 트러스 구조물을 대여합니다.' },
  { id: 'rp-tv-50', category: 'rental', name: '50인치 티비', desc: '행사장 안내·영상 송출용 50인치 티비를 대여합니다.' },
  { id: 'rp-pop-sign', category: 'rental', name: 'POP 안내판', desc: '행사장 안내를 위한 POP 안내판을 제작·대여합니다.' },
  { id: 'rp-butterfly-light', category: 'rental', name: '나비조명장식', desc: '포토존과 무대를 화사하게 만드는 나비조명 장식입니다.' },
  { id: 'rp-catering', category: 'rental', caseTypes: ['category-newyear'], name: '다과세팅', desc: '행사 자리에 어울리는 다과 테이블 세팅을 구성합니다.' },
  { id: 'rp-decotile', category: 'rental', name: '데코타일', desc: '행사장 바닥을 정돈된 느낌으로 마감하는 데코타일입니다.' },
  { id: 'rp-roulette', category: 'rental', name: '룰렛', desc: '이벤트 진행에 활용하는 대형 룰렛을 대여합니다.' },
  { id: 'rp-mesh-display', category: 'rental', name: '매쉬망전시', desc: '제품·사진 전시에 쓰이는 매쉬망 전시대입니다.' },
  { id: 'rp-stage-flower', category: 'rental', caseTypes: ['category-festival'], name: '무대앞 조화장식', desc: '무대 앞쪽을 화사하게 채우는 조화 장식입니다.' },
  { id: 'rp-mini-truss', category: 'rental', name: '미니트러스', desc: '소규모 공간에 어울리는 미니 트러스 구조물입니다.' },
  { id: 'rp-banner-sign', category: 'rental', caseTypes: ['category-gov'], name: '배너·안내판', desc: '행사 안내와 동선 정리를 위한 배너·안내판입니다.' },
  { id: 'rp-centerpiece', category: 'rental', name: '센터피스', desc: '테이블을 화사하게 꾸미는 센터피스 장식입니다.' },
  { id: 'rp-acrylic-podium', category: 'rental', caseTypes: ['category-gov'], name: '아크릴단상', desc: '깔끔한 진행 무대를 만드는 아크릴 단상입니다.' },
  { id: 'rp-bulb-light', category: 'rental', caseTypes: ['category-newyear'], name: '알전구', desc: '은은한 분위기를 더하는 알전구 장식입니다.' },
  { id: 'rp-air-arch', category: 'rental', name: '에어아치', desc: '행사장 입구를 알리는 에어아치입니다.' },
  { id: 'rp-easel', category: 'rental', name: '이젤', desc: '안내판·사진을 세워두는 이젤을 대여합니다.' },
  { id: 'rp-giant-banner', category: 'rental', name: '자이언트배너', desc: '멀리서도 눈에 띄는 대형 자이언트배너입니다.' },
  { id: 'rp-unveiling', category: 'rental', caseTypes: ['category-gov'], name: '제막식', desc: '기념비·현판 제막 행사에 필요한 막과 구조물입니다.' },
  { id: 'rp-photozone-instant', category: 'rental', name: '포토존 즉석인화', desc: '현장에서 바로 인화해주는 포토존 장비입니다.' },
  { id: 'rp-photozone-deco', category: 'rental', caseTypes: ['category-festival'], name: '포토존장식품', desc: '포토존을 완성하는 다양한 장식 소품입니다.' },
  { id: 'rp-picket', category: 'rental', name: '피켓', desc: '행사 진행에 쓰이는 피켓을 제작·대여합니다.' },
  { id: 'rp-lottery-draw', category: 'rental', name: '행운권추첨', desc: '행사 이벤트용 행운권추첨 세트를 대여합니다.' },
  { id: 'rp-banner-tear', category: 'rental', name: '현수막이탈', desc: '행사 안내에 쓰이는 현수막을 제작·설치합니다.' },
  { id: 'rp-camping-sofa', category: 'rental', caseTypes: ['category-newyear'], name: '캠핑·빈백', desc: '편안한 좌석이 필요한 자리를 위한 캠핑 체어·빈백입니다.' },
  { id: 'rp-cube-scasi', category: 'rental', name: '큐브 스카시', desc: '전시·진열에 활용하는 큐브 스카시 구조물입니다.' },
  { id: 'rp-christmas-deco', category: 'rental', caseTypes: ['category-newyear'], name: '크리스마스 장식', desc: '연말 분위기를 살리는 크리스마스 장식입니다.' },
  { id: 'rp-dressing-room', category: 'rental', name: '탈의실', desc: '행사장에 설치하는 간이 탈의실을 대여합니다.' },
  { id: 'rp-tape-cutting', category: 'rental', caseTypes: ['category-gov'], name: '테이프커팅식', desc: '준공식·개소식에 맞춘 테이프커팅 세트 일체입니다.' },
  { id: 'rp-truss-arch', category: 'rental', caseTypes: ['category-festival'], name: '트러스 입구아치', desc: '행사장 입구를 알리는 트러스 아치입니다.' },
  { id: 'rp-hope-ondol', category: 'rental', name: '희망온돌퍼포먼스', desc: '기념 행사에 쓰이는 희망온돌퍼포먼스 도구 일체입니다.' },
];

/* 테스트용 데모 PDF(6장)를 만든다. e2e.js 가 필요할 때 자동으로 호출한다. */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const p = await b.newPage();
  const slide = (eyebrow, title, sub, bg, fg = '#fff') => `
    <section style="page-break-after:always;width:1280px;height:720px;display:flex;flex-direction:column;
      justify-content:center;align-items:center;background:${bg};color:${fg};
      font-family:'Noto Sans CJK KR','Malgun Gothic',sans-serif;text-align:center">
      <div style="font-size:24px;letter-spacing:8px;opacity:.6">${eyebrow}</div>
      <div style="font-size:86px;font-weight:800;margin-top:14px;letter-spacing:-2px">${title}</div>
      <div style="font-size:30px;margin-top:20px;opacity:.8">${sub}</div>
    </section>`;
  await p.setContent(`<body style="margin:0">
    ${slide('YOUCAN STAGE', '2026 신규 무대 시스템', '제안 설명회', '#0A0910')}
    ${slide('01', '트러스 · 레이어 구성', '최대 12m 스팬 / 안전율 5:1', '#10212E')}
    ${slide('02', '음향 · 조명 패키지', 'LA8 라인어레이 + 무빙 24대', '#17301F')}
    ${slide('03', '현장 운영 인력', '오퍼레이터 3인 상주', '#2E2410')}
    ${slide('04', '견적 및 일정', '설치 D-2 / 철수 당일', '#2A1030')}
    ${slide('THANK YOU', '질의응답', 'youcanstage.co.kr', '#0A0910')}
  </body>`);
  await p.pdf({ path: require('path').join(__dirname, 'demo.pdf'), width: '1280px', height: '720px', printBackground: true });
  await b.close();
  console.log('demo.pdf written');
})();

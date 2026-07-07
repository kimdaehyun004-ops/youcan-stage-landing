async function sendInquiryEmail(inquiry) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!apiKey || !to) return;

  const lines = [
    `행사 종류: ${inquiry.eventType}`,
    `희망 일정: ${inquiry.date || '-'}`,
    `장소/지역: ${inquiry.location || '-'}`,
    `연락처: ${inquiry.contact}`,
    `요청 내용: ${inquiry.message || '-'}`,
    `접수 시각: ${inquiry.createdAt}`,
  ];

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'youcan스테이지 알림 <onboarding@resend.dev>',
        to: [to],
        subject: `[유캔스테이지] 새 견적 문의 - ${inquiry.eventType}`,
        text: lines.join('\n'),
      }),
    });
    if (!res.ok) {
      console.error('Resend email failed:', res.status, await res.text());
    }
  } catch (err) {
    console.error('Resend email error:', err.message);
  }
}

module.exports = { sendInquiryEmail };

(function () {
  const form = document.getElementById('contact-form');
  if (!form) return;

  const status = document.getElementById('contact-status');
  const submitBtn = form.querySelector('.contact-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = '';
    status.className = 'contact-status';

    const data = Object.fromEntries(new FormData(form).entries());

    if (!data.eventType || !data.contact) {
      status.textContent = '행사 종류와 연락처는 필수입니다.';
      status.classList.add('error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '전송 중...';

    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '문의 접수에 실패했습니다.');
      }
      status.textContent = '문의가 접수되었습니다. 빠르게 연락드리겠습니다.';
      status.classList.add('ok');
      form.reset();
    } catch (err) {
      status.textContent = err.message;
      status.classList.add('error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '견적 받기';
    }
  });
})();

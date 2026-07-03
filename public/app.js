const form = document.querySelector('#watch-form');
const grid = document.querySelector('#watch-grid');
const emptyState = document.querySelector('#empty-state');
const itemCount = document.querySelector('#item-count');
const apiCount = document.querySelector('#api-count');
const toast = document.querySelector('#toast');
const priceInput = form.elements.targetPrice;
// const testEmailButton = document.querySelector('#test-email-button');

const won = new Intl.NumberFormat('ko-KR');
let toastTimer;

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function relativeTime(dateValue) {
  if (!dateValue) return '첫 확인 대기 중';
  const diff = new Date(dateValue).getTime() - Date.now();
  if (diff <= 0) return '곧 확인 예정';
  const minutes = Math.max(1, Math.ceil(diff / 60000));
  return `${minutes}분 후 확인`;
}

function renderCard(item) {
  const currentPrice = item.schedule?.currentPrice ?? item.history?.[0]?.price ?? null;
  const progress = currentPrice ? Math.min(100, Math.round((item.targetPrice / currentPrice) * 100)) : 0;
  const reached = currentPrice !== null && currentPrice <= item.targetPrice;
  const nextCheck = item.schedule?.nextCheckAt;

  return `
    <article class="watch-card">
      <div class="card-top">
        <div>
          <h3 class="card-title">${escapeHtml(item.keyword)}</h3>
          <span class="card-email">${escapeHtml(item.email)}</span>
        </div>
        <button class="delete-button" data-delete-id="${item.id}" aria-label="${escapeHtml(item.keyword)} 알림 삭제">×</button>
      </div>
      <div class="price-line">
        <div class="price-block">
          <span>목표 가격</span>
          <strong>${won.format(item.targetPrice)}원</strong>
        </div>
        <div class="price-block current">
          <span>현재 최저가</span>
          <strong>${currentPrice ? `${won.format(currentPrice)}원` : '확인 중'}</strong>
        </div>
      </div>
      <div class="progress-track" aria-label="목표가 접근률 ${progress}%">
        <div class="progress-bar" style="width:${progress}%"></div>
      </div>
      <div class="card-footer">
        <span class="status-pill">${reached ? '● 목표가 도달' : '● 추적 중'}</span>
        <span>${relativeTime(nextCheck)}</span>
      </div>
    </article>`;
}

async function loadDashboard() {
  try {
    const response = await fetch('/api/dashboard');
    if (!response.ok) throw new Error('대시보드를 불러오지 못했습니다.');
    const data = await response.json();
    itemCount.textContent = data.items.length;
    apiCount.textContent = data.api.remaining;
    grid.innerHTML = data.items.map(renderCard).join('');
    emptyState.hidden = data.items.length > 0;
  } catch (error) {
    showToast(error.message, true);
  }
}

priceInput.addEventListener('input', () => {
  const digits = priceInput.value.replace(/[^0-9]/g, '').slice(0, 10);
  priceInput.value = digits ? won.format(Number(digits)) : '';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;

  try {
    const data = new FormData(form);
    const response = await fetch('/api/watch-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword: data.get('keyword'),
        targetPrice: Number(String(data.get('targetPrice')).replace(/[^0-9]/g, '')),
        email: data.get('email'),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || '등록하지 못했습니다.');
    form.reset();
    showToast('가격 알림을 등록했어요.');
    await loadDashboard();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
});

/* 이메일 연결 테스트 기능: 필요할 때 주석을 해제하세요.
testEmailButton.addEventListener('click', async () => {
  const email = String(form.elements.email.value ?? '').trim();
  if (!email || !form.elements.email.checkValidity()) {
    form.elements.email.reportValidity();
    return;
  }

  testEmailButton.disabled = true;
  const originalLabel = testEmailButton.querySelector('span').textContent;
  testEmailButton.querySelector('span').textContent = '전송 중...';

  try {
    const response = await fetch('/api/test-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || '테스트 메일을 보내지 못했습니다.');
    showToast('테스트 메일을 보냈어요. 받은편지함을 확인해 주세요.');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    testEmailButton.disabled = false;
    testEmailButton.querySelector('span').textContent = originalLabel;
  }
});
*/

grid.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete-id]');
  if (!button) return;
  if (!window.confirm('이 가격 알림을 삭제할까요?')) return;

  try {
    const response = await fetch(`/api/watch-items/${button.dataset.deleteId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('삭제하지 못했습니다.');
    showToast('가격 알림을 삭제했어요.');
    await loadDashboard();
  } catch (error) {
    showToast(error.message, true);
  }
});

loadDashboard();
setInterval(loadDashboard, 30_000);

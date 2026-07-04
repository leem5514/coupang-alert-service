const form = document.querySelector('#watch-form');
const grid = document.querySelector('#watch-grid');
const emptyState = document.querySelector('#empty-state');
const itemCount = document.querySelector('#item-count');
const providerCode = document.querySelector('#provider-code');
const providerLabel = document.querySelector('#provider-label');
const providerBanner = document.querySelector('#provider-banner');
const toast = document.querySelector('#toast');
const priceInput = form.elements.targetPrice;
const won = new Intl.NumberFormat('ko-KR');
let toastTimer;

function showToast(message, error = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function relativeTime(value) {
  if (!value) return '첫 조회 대기 중';
  const minutes = Math.max(1, Math.ceil((new Date(value).getTime() - Date.now()) / 60_000));
  return minutes <= 1 ? '곧 확인 예정' : `${minutes}분 후 확인`;
}

function chips(item) {
  const required = item.requiredTerms.map(value => `<span class="filter-chip include">+ ${escapeHtml(value)}</span>`);
  const excluded = item.excludedTerms.map(value => `<span class="filter-chip exclude">− ${escapeHtml(value)}</span>`);
  return [...required, ...excluded].join('');
}

function renderCard(item) {
  const currentPrice = item.schedule?.currentPrice ?? item.history?.[0]?.price ?? null;
  const progress = currentPrice ? Math.min(100, Math.round((item.targetPrice / currentPrice) * 100)) : 0;
  const reached = currentPrice !== null && currentPrice <= item.targetPrice;
  return `
    <article class="watch-card">
      <div class="card-top"><div><h3 class="card-title">#${escapeHtml(item.keyword)}</h3><span class="card-email">${escapeHtml(item.email)}</span></div><button class="delete-button" data-delete-id="${item.id}" aria-label="${escapeHtml(item.keyword)} 삭제">×</button></div>
      <div class="filter-chips">${chips(item) || '<span class="filter-chip">필터 없음</span>'}</div>
      <div class="price-line"><div class="price-block"><span>목표 가격</span><strong>${won.format(item.targetPrice)}원</strong></div><div class="price-block current"><span>현재 최저가</span><strong>${currentPrice ? `${won.format(currentPrice)}원` : '확인 중'}</strong></div></div>
      <div class="progress-track" aria-label="목표가 접근률 ${progress}%"><div class="progress-bar" style="width:${progress}%"></div></div>
      <div class="card-footer"><span class="status-pill">${reached ? '● 목표가 도달' : '● 추적 중'}</span><span>${escapeHtml(item.provider)} · ${relativeTime(item.schedule?.nextCheckAt)}</span></div>
    </article>`;
}

async function loadDashboard() {
  try {
    const response = await fetch('/api/dashboard');
    if (!response.ok) throw new Error('대시보드를 불러오지 못했습니다.');
    const data = await response.json();
    itemCount.textContent = data.items.length;
    providerCode.textContent = data.provider.id.toUpperCase();
    providerLabel.textContent = `${data.provider.label} 연결`;
    providerBanner.hidden = !data.provider.demo;
    providerBanner.innerHTML = data.provider.demo ? '<strong>데모 모드</strong><span>현재 가격은 시뮬레이션 데이터입니다. 배포 전 승인된 외부 가격 API를 연결하세요.</span>' : '';
    grid.innerHTML = data.items.map(renderCard).join('');
    emptyState.hidden = data.items.length > 0;
  } catch (error) { showToast(error.message, true); }
}

priceInput.addEventListener('input', () => {
  const digits = priceInput.value.replace(/[^0-9]/g, '').slice(0, 10);
  priceInput.value = digits ? won.format(Number(digits)) : '';
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const data = new FormData(form);
    const response = await fetch('/api/watch-items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword: data.get('keyword'), requiredTerms: data.get('requiredTerms'), excludedTerms: data.get('excludedTerms'),
        targetPrice: Number(String(data.get('targetPrice')).replace(/[^0-9]/g, '')), email: data.get('email'),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || '등록하지 못했습니다.');
    form.reset(); showToast('키워드 추적을 시작했어요.'); await loadDashboard();
  } catch (error) { showToast(error.message, true); }
  finally { button.disabled = false; }
});

grid.addEventListener('click', async event => {
  const button = event.target.closest('[data-delete-id]');
  if (!button || !window.confirm('이 키워드 추적을 삭제할까요?')) return;
  const response = await fetch(`/api/watch-items/${button.dataset.deleteId}`, { method: 'DELETE' });
  if (response.ok) { showToast('키워드 추적을 삭제했어요.'); await loadDashboard(); }
  else showToast('삭제하지 못했습니다.', true);
});

loadDashboard();
setInterval(loadDashboard, 30_000);

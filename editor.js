document.addEventListener('DOMContentLoaded', () => {
  const byId = id => document.getElementById(id);

  const form = byId('reportForm');
  const photoInput = byId('photoInput');
  const photoList = byId('photoList');
  const githubDialog = byId('githubDialog');
  const previewSection = byId('previewSection');
  const previewIframe = byId('preview');
  const publishStatus = byId('publishStatus');

  const ghOwner = byId('ghOwner');
  const ghRepo = byId('ghRepo');
  const ghBranch = byId('ghBranch');
  const ghToken = byId('ghToken');
  const ghStatus = byId('githubStatus');

  let photos = [];
  const DB = 'field-fire-report-drafts';
  const GH_CONFIG_KEY = 'field-report-github-config-v1';
  const GH_TOKEN_KEY = 'field-report-github-token-session-v1';

  // 현재 시각 포맷 함수: yyyy.mm.dd. hh:mm
  function getFormattedCurrentTime() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${y}.${m}.${d}. ${hh}:${mm}`;
  }

  // 모달 제어
  function openGithubModal() {
    if (!githubDialog) return;
    if (typeof githubDialog.showModal === 'function') {
      try { githubDialog.showModal(); }
      catch (err) { githubDialog.setAttribute('open', ''); githubDialog.style.display = 'block'; }
    } else {
      githubDialog.setAttribute('open', ''); githubDialog.style.display = 'block';
    }
  }

  function closeGithubModal() {
    if (!githubDialog) return;
    if (typeof githubDialog.close === 'function') githubDialog.close();
    githubDialog.removeAttribute('open');
    githubDialog.style.display = 'none';
  }

  if (byId('openGithub')) byId('openGithub').onclick = openGithubModal;
  if (byId('closeGithub')) byId('closeGithub').onclick = closeGithubModal;

  // 새 사건 시작 / 기본 서식 불러오기
  function resetDraft(blank) {
    if (!confirm(blank ? '새로운 사건을 시작할까요? (현재 시각으로 세팅됩니다)' : '기본 서식으로 내용을 채울까요?')) return;
    if (form) form.reset();
    const nowStr = getFormattedCurrentTime();

    if (blank && form) {
      for (const field of form.querySelectorAll('input[name],textarea[name]')) {
        if (!['author', 'unit', 'phone'].includes(field.name)) field.value = '';
      }
      // 시각 관련 항목에 현재시각 자동 입력
      const timeFields = ['statusTime', 'dispatch', 'knockdown', 'extinguished'];
      timeFields.forEach(name => {
        const el = form.elements.namedItem(name);
        if (el) el.value = nowStr;
      });
      // 인명피해 기본값
      const cas = form.elements.namedItem('casualties');
      if (cas) cas.value = '없음';
    }
    photos = [];
    renderPhotos();
    saveDraft();
  }

  if (byId('fresh')) byId('fresh').onclick = () => resetDraft(true);
  if (byId('sample')) byId('sample').onclick = () => resetDraft(false);

  // 백업(.json)
  if (byId('backup')) {
    byId('backup').onclick = () => {
      const data = { fields: Object.fromEntries(new FormData(form)), photos };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fire-report-draft-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
  }

  // 복원
  const draftFile = byId('draftFile');
  if (byId('restore')) byId('restore').onclick = () => draftFile && draftFile.click();
  if (draftFile) {
    draftFile.onchange = async () => {
      const file = draftFile.files[0];
      draftFile.value = '';
      if (!file) return;
      try {
        const { fields, photos: savedPhotos } = JSON.parse(await file.text());
        if (!fields || typeof fields.title !== 'string') {
          throw new Error('올바른 보고서 백업 파일이 아닙니다.');
        }
        if (!confirm('현재 작성 내용을 백업 파일의 데이터로 교체할까요?')) return;
        for (const field of form.querySelectorAll('[name]')) {
          if (typeof fields[field.name] === 'string') field.value = fields[field.name];
        }
        photos = Array.isArray(savedPhotos) ? savedPhotos : [];
        renderPhotos();
        saveDraft();
      } catch (error) {
        alert(error.message);
      }
    };
  }

  if (byId('closePreview')) {
    byId('closePreview').onclick = () => {
      if (previewSection) previewSection.hidden = true;
    };
  }

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function renderPhotos(){
    if (!photoList) return;
    photoList.innerHTML = '';
    photos.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'photo-item';
      row.innerHTML = `<img src="${p.src}" alt="선택 사진 ${i+1}">
        <input aria-label="사진 ${i+1} 설명" value="${esc(p.caption || '현장기록사진 ' + (i+1))}" data-caption="${i}">
        <button type="button" class="secondary" data-remove="${i}">삭제</button>`;
      photoList.append(row);
    });

    photoList.querySelectorAll('[data-caption]').forEach(el => el.oninput = () => {
      photos[+el.dataset.caption].caption = el.value;
      saveDraft();
    });

    photoList.querySelectorAll('[data-remove]').forEach(el => el.onclick = () => {
      photos.splice(+el.dataset.remove, 1);
      renderPhotos();
      saveDraft();
    });
  }

  function readImage(file){
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const maxDim = 1100;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.70));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  function compressDataUrl(src) {
    return new Promise((resolve) => {
      if (!src || src.length < 250000) return resolve(src);
      const img = new Image();
      img.onload = () => {
        const maxDim = 1000;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.65));
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });
  }

  if (photoInput) {
    photoInput.onchange = async () => {
      for (const f of photoInput.files) {
        if (photos.length >= 8) break;
        try {
          photos.push({ src: await readImage(f), caption: f.name.replace(/\.[^.]+$/, '') });
        } catch(e) {}
      }
      photoInput.value = '';
      renderPhotos();
      saveDraft();
    };
  }

  function openDB(){
    return new Promise((res, rej) => {
      try {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore('drafts');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (err) { rej(err); }
    });
  }

  async function saveDraft(){
    try {
      const db = await openDB();
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put({ fields: Object.fromEntries(new FormData(form)), photos }, 'latest');
    } catch(e) { console.warn('임시 저장 건너뜀:', e); }
  }

  async function loadDraft(){
    try {
      const db = await openDB();
      const tx = db.transaction('drafts', 'readonly');
      const req = tx.objectStore('drafts').get('latest');
      req.onsuccess = () => {
        const d = req.result;
        if (!d) return;
        for (const [k, v] of Object.entries(d.fields || {})) {
          const el = form.elements.namedItem(k);
          if (el) el.value = v;
        }
        photos = d.photos || [];
        renderPhotos();
      };
    } catch(e) {}
  }

  if (form) form.addEventListener('input', saveDraft);

  function formData(){
    const d = Object.fromEntries(new FormData(form));
    d.photos = photos;
    return d;
  }

  // 최종 보고서 HTML 렌더링 함수
  function render(d, css){
const address = d.address || '';
    const map = address ? `<div class="map-frame">
      <iframe title="화재 발생 현장 지도" src="https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed" loading="lazy"></iframe>
      <div class="map-links">
        <span class="map-links-label">지도 바로가기 :</span>
        <a href="https://map.kakao.com/link/search/${encodeURIComponent(address)}" target="_blank" rel="noopener">카카오맵</a>
        <span class="sep">·</span>
        <a href="https://map.naver.com/v5/search/${encodeURIComponent(address)}" target="_blank" rel="noopener">네이버 지도</a>
      </div>
    </div>` : '';
    const images = d.photos.map(x => x.src);
    const gallery = images.length ? `<section class="gallery"><img id="scene" src="${images[0]}" alt="${esc(d.photos[0].caption)}"><div class="photo-shade"></div><div class="photo-caption"><span>현장기록사진 <b id="photoCount">01 / ${String(images.length).padStart(2,'0')}</b></span><p id="caption">${esc(d.photos[0].caption)}</p></div><div class="photo-controls"><button id="prev" aria-label="이전 사진">‹</button><button id="pause" aria-label="사진 자동전환 정지">Ⅱ</button><button id="next" aria-label="다음 사진">›</button></div></section>` : '';
    const tel = d.phone ? `<span>전화 <a href="tel:${esc(d.phone)}">${esc(d.phone)}</a></span>` : '';
    
    // 발생일시 표시
    const statusTimeStr = d.statusTime || '-';

    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.title)} | 계룡소방서 현장대응단</title><style>${css}</style></head><body><header><div class="wrap"><b>계룡소방서 <span>현장대응단</span></b><button onclick="window.print()">인쇄 / PDF</button></div></header><main class="wrap"><div class="intro"><p class="eyebrow">FIRE INCIDENT BRIEFING · ${esc(statusTimeStr)}</p><div class="title-row"><h1>${esc(d.title)}<br><span>${esc(d.subtitle)}</span></h1><div class="complete"><small>진행상황</small><strong>${esc(d.status)}</strong><span>${esc(statusTimeStr)}</span></div></div><p class="subtitle">${esc(d.target)} · ${esc(address)}</p></div>${gallery}<section class="stats"><div><small>발생일시</small><strong>${esc(statusTimeStr)}</strong><span>기준 시각</span></div><div><small>진행상황</small><strong>${esc(d.status)}</strong><span>현장 상태</span></div><div><small>지원 출동</small><strong>${esc(d.unit)}</strong><span>${esc(d.crew)}</span></div><div><small>인명피해</small><strong>${esc(d.casualties || '없음')}</strong><span>상황보고 기준</span></div></section><div class="report-grid"><section class="panel"><p class="eyebrow">01 · INCIDENT OVERVIEW</p><h2>발생장소 및 현황</h2><dl><dt>주소</dt><dd>${esc(address)}</dd>${map}<dt>대상물</dt><dd>${esc(d.target)}</dd><dt>재난상황</dt><dd>${esc(d.situation)}</dd><dt>인명피해</dt><dd>${esc(d.casualties || '없음')}</dd><dt>원인</dt><dd>${esc(d.damage || '조사 중')}</dd></dl></section><section class="panel"><p class="eyebrow">02 · RESPONSE</p><h2>출동대 현황</h2><div class="crew"><span>계룡소방서</span><strong>${esc(d.unit)}</strong><p>${esc(d.crew)}</p></div><dl><dt>출동지령</dt><dd>${esc(d.dispatch || '-')}</dd><dt>초진일시</dt><dd>${esc(d.knockdown || '-')}</dd><dt>완진일시</dt><dd>${esc(d.extinguished || '-')}</dd><dt>활동사항</dt><dd>${esc(d.activity || '현장 활동 중')}</dd></dl></section></div><section class="panel timeline-panel"><p class="eyebrow">03 · RESPONSE TIMELINE</p><h2>주요 대응 경과</h2><ol class="timeline"><li><time>${esc(d.dispatch || '-')}</time><strong>출동지령</strong></li><li><time>${esc(d.knockdown || '-')}</time><strong>초진</strong></li><li><time>${esc(d.extinguished || '-')}</time><strong>완진</strong></li></ol></section><footer><b>계룡소방서 현장대응단</b><p class="author-contact">작성자: ${esc(d.author)} ${tel}</p><p>최종 조사결과와 개별 대원 활동일지는 별도 확인이 필요합니다.</p></footer></main><script>(function(){const pics=${JSON.stringify(images)},caps=${JSON.stringify(d.photos.map(p=>p.caption||''))};if(!pics.length)return;let i=0,t=null;const im=document.getElementById('scene'),cap=document.getElementById('caption'),count=document.getElementById('photoCount'),pause=document.getElementById('pause');function show(n){i=(n+pics.length)%pics.length;im.src=pics[i];im.alt=caps[i]||'현장기록사진';cap.textContent=caps[i]||'현장기록사진';count.textContent=String(i+1).padStart(2,'0')+' / '+String(pics.length).padStart(2,'0')}function stop(){clearInterval(t);t=null;pause.textContent='▶'}function play(){stop();t=setInterval(()=>show(i+1),5000);pause.textContent='Ⅱ'}document.getElementById('prev').onclick=()=>{stop();show(i-1)};document.getElementById('next').onclick=()=>{stop();show(i+1)};pause.onclick=()=>t?stop():play();if(!matchMedia('(prefers-reduced-motion: reduce)').matches)play()})();<\/script></body></html>`;
  }

  async function output(download){
    if (form && !form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const d = formData();
    let css = '';
    try {
      css = await (await fetch('style.css', { cache: 'no-store' })).text();
    } catch (e) {
      console.warn('CSS 로드 실패, 기본 스타일 유지:', e);
    }
    const html = render(d, css);

    if (download) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      a.download = 'index.html';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } else {
      if (previewIframe) previewIframe.srcdoc = html;
      if (previewSection) {
        previewSection.hidden = false;
        previewSection.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }

  if (byId('previewBtn')) byId('previewBtn').onclick = () => output(false);
  if (byId('downloadBtn')) byId('downloadBtn').onclick = () => output(true);

  // GitHub 배포
  function setGhStatus(message, kind = ''){
    if (ghStatus) {
      ghStatus.textContent = message;
      ghStatus.className = 'github-status ' + kind;
    }
    if (publishStatus) {
      publishStatus.textContent = message;
    }
  }

  function getGhConfig(){
    const owner = ghOwner ? ghOwner.value.trim() : '';
    const repo = ghRepo ? ghRepo.value.trim() : '';
    const branch = ghBranch ? ghBranch.value.trim() : '';
    if (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo) || !branch || branch.includes('..') || branch.startsWith('/') || branch.endsWith('/')) {
      throw new Error('GitHub 소유자, 저장소, 브랜치를 확인해 주세요.');
    }
    return { owner, repo, branch };
  }

  function getGhToken(){
    const token = (ghToken ? ghToken.value.trim() : '') || sessionStorage.getItem(GH_TOKEN_KEY) || localStorage.getItem(GH_TOKEN_KEY) || '';
    if (!token) throw new Error('GitHub 토큰을 입력해 주세요.');
    return token;
  }

  function rememberGhConfig(token){
    const c = getGhConfig();
    localStorage.setItem(GH_CONFIG_KEY, JSON.stringify(c));
    sessionStorage.setItem(GH_TOKEN_KEY, token);
    localStorage.setItem(GH_TOKEN_KEY, token);
    if (ghToken) ghToken.value = token;
    return c;
  }

  async function ghRequest(url, token, options = {}){
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const headers = {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.headers || {})
      };
      if (options.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }

      const res = await fetch(url, { ...options, signal: controller.signal, headers });
      let data = {};
      try { data = await res.json(); } catch {}

      if (!res.ok) {
        const e = new Error(data.message || `GitHub 응답 오류 (${res.status})`);
        e.status = res.status;
        throw e;
      }
      return data;
    } catch(e) {
      if (e.name === 'AbortError') throw new Error('GitHub 응답 시간이 초과되었습니다.');
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }

  function ghMessage(e){
    if (e.status === 401) return '토큰이 잘못되었거나 만료되었습니다 (401).';
    if (e.status === 403) return '권한이 없습니다 (403). 토큰의 접근 가능 저장소(Repository access)와 Contents 권한(Read and write)을 확인해 주세요.';
    if (e.status === 404) return '저장소 또는 브랜치를 찾지 못했습니다 (404).';
    if (e.status === 409) return '저장소 변경 충돌(409)입니다. 새로고침 후 다시 시도해 주세요.';
    if (e.status === 415) return '요청 형식(Content-Type) 오류입니다 (415).';
    if (e.status === 422) return 'GitHub가 파일 저장을 거부했습니다 (422). 1MB 용량 한도나 브랜치 보호를 확인해 주세요.';
    return e.message || 'GitHub 연결 중 오류가 발생했습니다.';
  }

  async function verifyGh(){
    const c = getGhConfig();
    const token = getGhToken();
    setGhStatus('GitHub 저장소 접근 확인 중…');
    const branch = encodeURIComponent(c.branch);
    await ghRequest(`https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/branches/${branch}`, token);
    rememberGhConfig(token);
    setGhStatus(`${c.owner}/${c.repo} · ${c.branch} 연결 확인 완료!`, 'success');
  }

  function encodeBase64Utf8(value){
    return new Promise((resolve, reject) => {
      try {
        const blob = new Blob([value], { type: 'text/html;charset=utf-8' });
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          resolve(result.substring(result.indexOf(',') + 1));
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      } catch (err) { reject(err); }
    });
  }

  async function publishToGithub(){
    const button = byId('publishBtn');
    if (form && !form.checkValidity()) {
      form.reportValidity();
      return;
    }

    let c, token;
    try {
      c = getGhConfig();
      token = getGhToken();
    } catch(e) {
      setGhStatus(e.message, 'error');
      alert(e.message);
      openGithubModal();
      return;
    }

    if (!confirm(`현재 보고서를 ${c.owner}/${c.repo} (${c.branch})의 index.html로 배포할까요?`)) return;

    if (button) button.disabled = true;
    setGhStatus('보고서 파일을 생성하고 GitHub에 배포 중…');

    try {
      rememberGhConfig(token);

      for (let i = 0; i < photos.length; i++) {
        photos[i].src = await compressDataUrl(photos[i].src);
      }

      let css = '';
      try {
        css = await (await fetch('style.css', { cache: 'no-store' })).text();
      } catch (err) {}

      const d = formData();
      const html = render(d, css);
      const byteLength = new TextEncoder().encode(html).length;

      if (byteLength > 980 * 1024) {
        throw new Error(`게시 파일 크기(${(byteLength/1024).toFixed(0)}KB)가 GitHub 1MB 한도를 초과합니다. 첨부 사진을 줄여주세요.`);
      }

      const base = `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/index.html`;

      await ghRequest(`https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/branches/${encodeURIComponent(c.branch)}`, token);

      let sha = null;
      try {
        const file = await ghRequest(`${base}?ref=${encodeURIComponent(c.branch)}`, token);
        sha = file && file.sha ? file.sha : null;
      } catch(e) {
        if (e.status !== 404) throw e;
      }

      const body = {
        message: '현장 화재상황보고서 배포: ' + (d.title || '상황보고'),
        content: await encodeBase64Utf8(html),
        branch: c.branch
      };
      if (sha) body.sha = sha;

      const result = await ghRequest(base, token, {
        method: 'PUT',
        body: JSON.stringify(body)
      });

      const commit = result.commit && result.commit.sha ? result.commit.sha.slice(0, 7) : '';
      const successMsg = `배포 완료${commit ? ` (커밋: ${commit})` : ''}! GitHub Pages 반영까지 약 1~2분이 소요됩니다.`;
      setGhStatus(successMsg, 'success');
      alert(successMsg);
    } catch(e) {
      const errMsg = ghMessage(e);
      setGhStatus(errMsg, 'error');
      alert(`배포 오류: ${errMsg}`);
    } finally {
      if (button) button.disabled = false;
    }
  }

  if (byId('saveGithubBtn')) {
    byId('saveGithubBtn').onclick = async () => {
      try { await verifyGh(); }
      catch(e) { setGhStatus(ghMessage(e), 'error'); }
    };
  }

  if (byId('clearTokenBtn')) {
    byId('clearTokenBtn').onclick = () => {
      sessionStorage.removeItem(GH_TOKEN_KEY);
      localStorage.removeItem(GH_TOKEN_KEY);
      if (ghToken) ghToken.value = '';
      setGhStatus('저장된 GitHub 토큰을 모두 지웠습니다.', '');
    };
  }

  if (byId('publishBtn')) byId('publishBtn').onclick = publishToGithub;

  try {
    const saved = JSON.parse(localStorage.getItem(GH_CONFIG_KEY) || '{}');
    if (saved.owner && ghOwner) ghOwner.value = saved.owner;
    if (saved.repo && ghRepo) ghRepo.value = saved.repo;
    if (saved.branch && ghBranch) ghBranch.value = saved.branch;
    if (ghToken) ghToken.value = sessionStorage.getItem(GH_TOKEN_KEY) || localStorage.getItem(GH_TOKEN_KEY) || '';
  } catch {}

  loadDraft();
});

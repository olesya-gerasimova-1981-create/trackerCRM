(function () {
  'use strict';

  const STORAGE_KEY = 'salesTracker_deals';
  const USER_KEY = 'salesTracker_user';

  const USERS = {
    user1: { name: 'Алексей', role: 'manager' },
    user2: { name: 'Мария', role: 'manager' },
    user3: { name: 'Дмитрий', role: 'manager' },
    boss: { name: 'Ирина', role: 'boss' },
  };

  const STATUSES = {
    new:         { label: 'Новый контакт',        order: 0 },
    meeting:     { label: 'Встреча назначена',    order: 1 },
    quote:       { label: 'КП отправлено',        order: 2 },
    negotiation: { label: 'Переговоры/согласование', order: 3 },
    contract:    { label: 'Договор подписан',     order: 4 },
    paid:        { label: 'Оплачено',             order: 5 },
  };

  const CURRENCY_SYMBOLS = { RUB: '₽', USD: '$', EUR: '€' };

  let deals = [];
  let currentUser = loadUser();
  let currentFilterManager = '';
  let currentFilterStatus = '';
  let draggedCard = null;
  let draggedDealId = null;

  function loadDeals() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveDeals() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
  }

  function loadUser() {
    return localStorage.getItem(USER_KEY) || 'user1';
  }

  function saveUser(uid) {
    localStorage.setItem(USER_KEY, uid);
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function isBoss() {
    return USERS[currentUser]?.role === 'boss';
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDate(str) {
    if (!str) return '';
    const d = new Date(str);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  function formatDateFull(str) {
    if (!str) return '';
    const d = new Date(str);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function amountStr(amount, currency) {
    if (!amount && amount !== 0) return '';
    const sym = CURRENCY_SYMBOLS[currency] || '₽';
    return Number(amount).toLocaleString('ru-RU') + ' ' + sym;
  }

  function deadlineClass(nextDate) {
    if (!nextDate) return '';
    const today = todayStr();
    if (nextDate < today) return 'overdue';
    if (nextDate === today) return 'today';
    return '';
  }

  function deadlineLabel(nextDate) {
    if (!nextDate) return '';
    const today = todayStr();
    const diff = Math.ceil((new Date(nextDate) - new Date(today)) / 86400000);
    if (diff < 0) return 'Просрочено';
    if (diff === 0) return 'Сегодня';
    if (diff === 1) return 'Завтра';
    return formatDate(nextDate);
  }

  function deadlineIcon(nextDate) {
    const cls = deadlineClass(nextDate);
    if (cls === 'overdue') return '⚠️';
    if (cls === 'today') return '⏰';
    return '📅';
  }

  function getVisibleDeals() {
    let list = deals;
    if (!isBoss()) {
      list = list.filter(d => d.manager === currentUser);
    }
    if (currentFilterManager) {
      list = list.filter(d => d.manager === currentFilterManager);
    }
    if (currentFilterStatus) {
      list = list.filter(d => d.status === currentFilterStatus);
    }
    return list;
  }

  function sortDeals(list) {
    return [...list].sort((a, b) => {
      const today = todayStr();
      const aDate = a.nextDate || '9999';
      const bDate = b.nextDate || '9999';
      const aOverdue = aDate < today ? 0 : 1;
      const bOverdue = bDate < today ? 0 : 1;
      const aToday = aDate === today ? 0 : 1;
      const bToday = bDate === today ? 0 : 1;
      const aPriority = aOverdue * 4 + aToday * 2;
      const bPriority = bOverdue * 4 + bToday * 2;
      if (aPriority !== bPriority) return aPriority - bPriority;
      if (aDate !== bDate) return aDate < bDate ? -1 : 1;
      return 0;
    });
  }

  function getNotifications() {
    const today = todayStr();
    const visible = getVisibleDeals();
    const notifs = [];

    visible.forEach(d => {
      if (!d.nextDate) return;
      if (d.nextDate < today) {
        notifs.push({
          type: 'overdue',
          dealId: d.id,
          text: `Просрочено: "${d.client}" — ${deadlineLabel(d.nextDate)} (${STATUSES[d.status]?.label})`,
        });
      } else if (d.nextDate === today) {
        notifs.push({
          type: 'warning',
          dealId: d.id,
          text: `Сегодня: "${d.client}" — ${STATUSES[d.status]?.label}`,
        });
      } else {
        const diff = Math.ceil((new Date(d.nextDate) - new Date(today)) / 86400000);
        if (diff <= 3) {
          notifs.push({
            type: 'warning',
            dealId: d.id,
            text: `Через ${diff} дн.: "${d.client}" — ${STATUSES[d.status]?.label}`,
          });
        }
      }
    });

    return notifs;
  }

  function populateManagerFilter() {
    const sel = document.getElementById('filterManager');
    sel.innerHTML = '<option value="">Все менеджеры</option>';
    Object.entries(USERS).forEach(([id, u]) => {
      if (u.role === 'manager') {
        sel.innerHTML += `<option value="${id}">${u.name}</option>`;
      }
    });
    sel.value = currentFilterManager;
  }

  function populateStatusFilter() {
    const sel = document.getElementById('filterStatus');
    sel.innerHTML = '<option value="">Все статусы</option>';
    Object.entries(STATUSES).forEach(([key, s]) => {
      sel.innerHTML += `<option value="${key}">${s.label}</option>`;
    });
    sel.value = currentFilterStatus;
  }

  function renderBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';
    const visible = getVisibleDeals();

    Object.entries(STATUSES).forEach(([key, s]) => {
      const col = document.createElement('div');
      col.className = 'column';
      col.dataset.status = key;

      const dealsInCol = sortDeals(visible.filter(d => d.status === key));

      col.innerHTML = `
        <div class="column-header">
          <span>${s.label}</span>
          <span class="column-count">${dealsInCol.length}</span>
        </div>
        <div class="column-body" data-status="${key}"></div>
      `;

      const body = col.querySelector('.column-body');

      dealsInCol.forEach(deal => {
        body.appendChild(createCard(deal));
      });

      setupDropZone(body, key);
      board.appendChild(col);
    });

    renderStats();
    updateNotifications();
    initTouchDrag();
  }

  function createCard(deal) {
    const card = document.createElement('div');
    card.className = 'deal-card';
    card.dataset.dealId = deal.id;
    card.draggable = true;

    const dc = deadlineClass(deal.nextDate);
    if (dc === 'overdue') card.classList.add('overdue');
    if (dc === 'today') card.classList.add('today');

    let managerName = USERS[deal.manager]?.name || deal.manager;

    card.innerHTML = `
      <div class="card-client">${escapeHtml(deal.client || 'Без названия')}</div>
      ${deal.contact ? `<div class="card-contact">${escapeHtml(deal.contact)}</div>` : ''}
      ${isBoss() ? `<div class="card-manager">${escapeHtml(managerName)}</div>` : ''}
      ${deal.amount ? `<div class="card-amount">${amountStr(deal.amount, deal.currency)}</div>` : ''}
      <div class="card-meta">
        <div class="card-deadline ${dc === 'overdue' ? 'overdue' : ''} ${dc === 'today' ? 'today-deadline' : ''}">
          ${deal.nextDate ? `<span class="deadline-icon">${deadlineIcon(deal.nextDate)}</span> ${deadlineLabel(deal.nextDate)}` : '<span>—</span>'}
        </div>
        ${deal.activity ? `<span class="card-activity-tag">${escapeHtml(deal.activity)}</span>` : ''}
      </div>
    `;

    card.addEventListener('click', () => openDealModal(deal.id));

    card.addEventListener('dragstart', (e) => {
      draggedDealId = deal.id;
      draggedCard = card;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', deal.id);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      draggedCard = null;
      draggedDealId = null;
      document.querySelectorAll('.column-body').forEach(b => b.classList.remove('drag-over'));
      document.querySelectorAll('.drag-placeholder').forEach(p => p.remove());
    });

    return card;
  }

  function setupDropZone(body, statusKey) {
    body.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      body.classList.add('drag-over');

      const placeholder = body.querySelector('.drag-placeholder');
      if (!placeholder) {
        const ph = document.createElement('div');
        ph.className = 'drag-placeholder';
        body.appendChild(ph);
      }
    });

    body.addEventListener('dragleave', (e) => {
      if (!body.contains(e.relatedTarget)) {
        body.classList.remove('drag-over');
        body.querySelectorAll('.drag-placeholder').forEach(p => p.remove());
      }
    });

    body.addEventListener('drop', (e) => {
      e.preventDefault();
      body.classList.remove('drag-over');
      body.querySelectorAll('.drag-placeholder').forEach(p => p.remove());

      const dealId = e.dataTransfer.getData('text/plain');
      if (!dealId) return;

      const deal = deals.find(d => d.id === dealId);
      if (!deal) return;

      if (!isBoss() && deal.manager !== currentUser) return;

      const oldStatus = deal.status;
      deal.status = statusKey;

      if (oldStatus !== statusKey) {
        deal.comments.push({
          text: `Этап изменён: «${STATUSES[oldStatus]?.label}» → «${STATUSES[statusKey]?.label}»`,
          author: USERS[currentUser]?.name || currentUser,
          date: new Date().toISOString(),
        });
      }

      saveDeals();
      renderBoard();
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function initTouchDrag() {
    let touchClone = null;
    let touchDealId = null;
    let touchStartX = 0;
    let touchStartY = 0;
    let isDragging = false;
    let longPressTimer = null;

    document.querySelectorAll('.deal-card').forEach(card => {
      card.addEventListener('touchstart', (e) => {
        const dealId = card.dataset.dealId;
        const deal = deals.find(d => d.id === dealId);
        if (!deal) return;
        if (!isBoss() && deal.manager !== currentUser) return;

        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchDealId = dealId;

        longPressTimer = setTimeout(() => {
          isDragging = true;
          card.classList.add('dragging');
          touchClone = card.cloneNode(true);
          touchClone.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;opacity:0.85;width:' + card.offsetWidth + 'px;transform:rotate(3deg);';
          document.body.appendChild(touchClone);
          positionClone(e.touches[0]);
        }, 400);
      }, { passive: true });

      card.addEventListener('touchmove', (e) => {
        if (!isDragging || !touchClone) {
          const dx = Math.abs(e.touches[0].clientX - touchStartX);
          const dy = Math.abs(e.touches[0].clientY - touchStartY);
          if (dx > 10 || dy > 10) {
            clearTimeout(longPressTimer);
          }
          return;
        }
        e.preventDefault();
        positionClone(e.touches[0]);
        highlightDropTarget(e.touches[0]);
      }, { passive: false });

      card.addEventListener('touchend', () => {
        clearTimeout(longPressTimer);
        if (isDragging && touchClone) {
          const target = findDropTarget();
          if (target && touchDealId) {
            const deal = deals.find(d => d.id === touchDealId);
            if (deal) {
              const newStatus = target.dataset.status;
              const oldStatus = deal.status;
              deal.status = newStatus;
              if (oldStatus !== newStatus) {
                deal.comments.push({
                  text: `Этап изменён: «${STATUSES[oldStatus]?.label}» → «${STATUSES[newStatus]?.label}»`,
                  author: USERS[currentUser]?.name || currentUser,
                  date: new Date().toISOString(),
                });
              }
              saveDeals();
              renderBoard();
            }
          }
          touchClone.remove();
          touchClone = null;
          card.classList.remove('dragging');
          document.querySelectorAll('.column-body').forEach(b => b.classList.remove('drag-over'));
          document.querySelectorAll('.drag-placeholder').forEach(p => p.remove());
        }
        isDragging = false;
        touchDealId = null;
      });

      card.addEventListener('touchcancel', () => {
        clearTimeout(longPressTimer);
        if (touchClone) { touchClone.remove(); touchClone = null; }
        isDragging = false;
        touchDealId = null;
        card.classList.remove('dragging');
        document.querySelectorAll('.column-body').forEach(b => b.classList.remove('drag-over'));
        document.querySelectorAll('.drag-placeholder').forEach(p => p.remove());
      });
    });

    function positionClone(touch) {
      if (!touchClone) return;
      touchClone.style.left = (touch.clientX - touchClone.offsetWidth / 2) + 'px';
      touchClone.style.top = (touch.clientY - 20) + 'px';
    }

    function highlightDropTarget(touch) {
      document.querySelectorAll('.column-body').forEach(b => b.classList.remove('drag-over'));
      document.querySelectorAll('.drag-placeholder').forEach(p => p.remove());
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      if (el) {
        const body = el.closest('.column-body');
        if (body) {
          body.classList.add('drag-over');
          const ph = document.createElement('div');
          ph.className = 'drag-placeholder';
          body.appendChild(ph);
        }
      }
    }

    function findDropTarget() {
      if (!touchClone) return null;
      const rect = touchClone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const el = document.elementFromPoint(cx, cy);
      if (el) {
        const body = el.closest('.column-body');
        if (body) return body;
      }
      return null;
    }
  }

  function renderStats() {
    const visible = getVisibleDeals();
    const today = todayStr();
    const total = visible.length;
    const overdue = visible.filter(d => d.nextDate && d.nextDate < today).length;
    const todayCount = visible.filter(d => d.nextDate === today).length;
    const totalAmount = visible.reduce((s, d) => s + (Number(d.amount) || 0), 0);

    document.getElementById('toolbarStats').innerHTML = `
      <span class="stat-item">Всего: <span class="stat-value">${total}</span></span>
      <span class="stat-item">Сегодня: <span class="stat-value">${todayCount}</span></span>
      ${overdue > 0 ? `<span class="stat-item" style="color:var(--danger)">Просрочено: <span class="stat-value">${overdue}</span></span>` : ''}
      ${totalAmount > 0 ? `<span class="stat-item">Сумма: <span class="stat-value">${amountStr(totalAmount, 'RUB')}</span></span>` : ''}
    `;
  }

  function updateNotifications() {
    const notifs = getNotifications();
    const badge = document.getElementById('notifBadge');
    const overdueCount = notifs.filter(n => n.type === 'overdue').length;

    if (overdueCount > 0) {
      badge.style.display = 'flex';
      badge.textContent = overdueCount;
    } else {
      badge.style.display = 'none';
    }
  }

  function renderNotifications() {
    const notifs = getNotifications();
    const list = document.getElementById('notifList');

    if (notifs.length === 0) {
      list.innerHTML = '<div class="notif-empty">Нет уведомлений</div>';
      return;
    }

    list.innerHTML = notifs.map(n => `
      <div class="notif-item ${n.type}"       data-deal-id="${n.dealId}">
        ${escapeHtml(n.text)}
      </div>
    `).join('');

    list.querySelectorAll('.notif-item').forEach(item => {
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        const id = item.dataset.dealId;
        const deal = deals.find(d => d.id === id);
        if (deal) openDealModal(id);
      });
    });
  }

  function openDealModal(dealId) {
    const overlay = document.getElementById('modalOverlay');
    const form = document.getElementById('dealForm');
    const title = document.getElementById('modalTitle');
    const deleteBtn = document.getElementById('deleteDealBtn');

    form.reset();
    document.getElementById('commentsList').innerHTML = '';

    if (dealId) {
      const deal = deals.find(d => d.id === dealId);
      if (!deal) return;

      if (!isBoss() && deal.manager !== currentUser) return;

      title.textContent = 'Редактирование сделки';
      deleteBtn.style.display = 'inline-block';

      document.getElementById('dealId').value = deal.id;
      document.getElementById('dealClient').value = deal.client || '';
      document.getElementById('dealContact').value = deal.contact || '';
      document.getElementById('dealPhone').value = deal.phone || '';
      document.getElementById('dealEmail').value = deal.email || '';
      document.getElementById('dealAmount').value = deal.amount || '';
      document.getElementById('dealCurrency').value = deal.currency || 'RUB';
      document.getElementById('dealCloseDate').value = deal.closeDate || '';
      document.getElementById('dealNextDate').value = deal.nextDate || '';
      document.getElementById('dealActivity').value = deal.activity || '';
      document.getElementById('dealStatus').value = deal.status || 'new';

      const mgr = document.getElementById('dealManager');
      if (isBoss()) {
        mgr.disabled = false;
        mgr.value = deal.manager;
      } else {
        mgr.disabled = true;
        mgr.value = currentUser;
      }

      renderComments(deal);
    } else {
      title.textContent = 'Новая сделка';
      deleteBtn.style.display = 'none';
      document.getElementById('dealId').value = '';

      const mgr = document.getElementById('dealManager');
      if (isBoss()) {
        mgr.disabled = false;
        mgr.value = 'user1';
      } else {
        mgr.disabled = true;
        mgr.value = currentUser;
      }
    }

    overlay.style.display = 'flex';
  }

  function closeDealModal() {
    document.getElementById('modalOverlay').style.display = 'none';
  }

  function renderComments(deal) {
    const list = document.getElementById('commentsList');
    if (!deal.comments || deal.comments.length === 0) {
      list.innerHTML = '<div class="empty-state">Нет комментариев</div>';
      return;
    }

    list.innerHTML = deal.comments.map(c => `
      <div class="comment-item">
        <span class="comment-author">${escapeHtml(c.author)}</span>: ${escapeHtml(c.text)}
        <div class="comment-meta">${formatDateFull(c.date)}</div>
      </div>
    `).join('');

    list.scrollTop = list.scrollHeight;
  }

  function addComment() {
    const input = document.getElementById('commentInput');
    const text = input.value.trim();
    if (!text) return;

    const dealId = document.getElementById('dealId').value;
    const deal = deals.find(d => d.id === dealId);
    if (!deal) return;

    deal.comments.push({
      text,
      author: USERS[currentUser]?.name || currentUser,
      date: new Date().toISOString(),
    });

    saveDeals();
    input.value = '';
    renderComments(deal);
  }

  function saveDeal(e) {
    e.preventDefault();

    const dealId = document.getElementById('dealId').value;
    const data = {
      client: document.getElementById('dealClient').value.trim(),
      contact: document.getElementById('dealContact').value.trim(),
      phone: document.getElementById('dealPhone').value.trim(),
      email: document.getElementById('dealEmail').value.trim(),
      amount: document.getElementById('dealAmount').value,
      currency: document.getElementById('dealCurrency').value,
      closeDate: document.getElementById('dealCloseDate').value,
      nextDate: document.getElementById('dealNextDate').value,
      activity: document.getElementById('dealActivity').value,
      status: document.getElementById('dealStatus').value,
      manager: isBoss()
        ? document.getElementById('dealManager').value
        : currentUser,
    };

    if (!data.client) return;

    if (dealId) {
      const deal = deals.find(d => d.id === dealId);
      if (!deal) return;

      if (!isBoss() && deal.manager !== currentUser) return;

      const oldStatus = deal.status;
      Object.assign(deal, data);

      if (oldStatus !== data.status) {
        deal.comments.push({
          text: `Этап изменён: «${STATUSES[oldStatus]?.label}» → «${STATUSES[data.status]?.label}»`,
          author: USERS[currentUser]?.name || currentUser,
          date: new Date().toISOString(),
        });
      }

      if (!deal.comments) deal.comments = [];
    } else {
      deals.push({
        id: generateId(),
        ...data,
        comments: [],
        createdAt: new Date().toISOString(),
      });
    }

    saveDeals();
    closeDealModal();
    renderBoard();
  }

  function deleteDeal() {
    const dealId = document.getElementById('dealId').value;
    if (!dealId) return;

    if (!confirm('Удалить сделку?')) return;

    deals = deals.filter(d => d.id !== dealId);
    saveDeals();
    closeDealModal();
    renderBoard();
  }

  function seedDemoData() {
    if (deals.length > 0) return;

    const today = todayStr();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const in3 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    deals = [
      {
        id: generateId(), client: 'ООО «Ромашка»', contact: 'Петров И.С., директор',
        phone: '+7 (495) 111-22-33', email: 'petrov@romashka.ru',
        amount: 500000, currency: 'RUB', closeDate: in7, nextDate: yesterday,
        activity: 'Звонок', status: 'new', manager: 'user1',
        comments: [
          { text: 'Первый звонок — заинтересованы', author: 'Алексей', date: new Date(Date.now() - 2 * 86400000).toISOString() },
        ],
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      },
      {
        id: generateId(), client: 'ЗАО «Технологии»', contact: 'Сидорова А.П., закупки',
        phone: '+7 (812) 444-55-66', email: 'sidorova@tech.ru',
        amount: 1200000, currency: 'RUB', closeDate: in7, nextDate: today,
        activity: 'Встреча', status: 'meeting', manager: 'user1',
        comments: [],
        createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      },
      {
        id: generateId(), client: 'ИП Козлов', contact: 'Козлов В.Н.',
        phone: '+7 (903) 777-88-99', email: 'kozlov@mail.ru',
        amount: 200000, currency: 'RUB', closeDate: tomorrow, nextDate: in3,
        activity: 'Коммерческое предложение', status: 'quote', manager: 'user2',
        comments: [
          { text: 'КП отправлено, ждём ответа', author: 'Мария', date: new Date().toISOString() },
        ],
        createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      },
      {
        id: generateId(), client: 'АО «СтройМаш»', contact: 'Иванов Д.А., ген. директор',
        phone: '+7 (343) 222-33-44', email: 'ivanov@stroymash.ru',
        amount: 800000, currency: 'RUB', closeDate: in3, nextDate: tomorrow,
        activity: 'Договор', status: 'negotiation', manager: 'user3',
        comments: [
          { text: 'Согласование цен', author: 'Дмитрий', date: new Date().toISOString() },
        ],
        createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      },
      {
        id: generateId(), client: 'ООО «Альфа»', contact: 'Новикова Е.В.',
        phone: '+7 (495) 999-00-11', email: 'novikova@alpha.ru',
        amount: 350000, currency: 'RUB', closeDate: yesterday, nextDate: yesterday,
        activity: 'Договор', status: 'contract', manager: 'user2',
        comments: [],
        createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
      },
      {
        id: generateId(), client: 'ПАО «МеталлПром»', contact: 'Соколов К.М.',
        phone: '+7 (343) 555-66-77', email: 'sokolov@metprom.ru',
        amount: 2000000, currency: 'RUB', closeDate: in7, nextDate: '',
        activity: '', status: 'paid', manager: 'user1',
        comments: [
          { text: 'Оплата получена', author: 'Ирина', date: new Date().toISOString() },
        ],
        createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      },
    ];

    saveDeals();
  }

  function init() {
    deals = loadDeals();
    seedDemoData();

    document.getElementById('userSelect').value = currentUser;

    document.getElementById('userSelect').addEventListener('change', (e) => {
      currentUser = e.target.value;
      saveUser(currentUser);
      currentFilterManager = '';
      currentFilterStatus = '';
      document.getElementById('filterManager').value = '';
      document.getElementById('filterStatus').value = '';
      renderBoard();
    });

    document.getElementById('filterManager').addEventListener('change', (e) => {
      currentFilterManager = e.target.value;
      renderBoard();
    });

    document.getElementById('filterStatus').addEventListener('change', (e) => {
      currentFilterStatus = e.target.value;
      renderBoard();
    });

    document.getElementById('filterToggleBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      const dd = document.getElementById('filtersDropdown');
      dd.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      const dd = document.getElementById('filtersDropdown');
      const btn = document.getElementById('filterToggleBtn');
      if (!dd.contains(e.target) && !btn.contains(e.target)) {
        dd.classList.remove('open');
      }
    });

    document.getElementById('addDealBtn').addEventListener('click', () => openDealModal(null));
    document.getElementById('closeModalBtn').addEventListener('click', closeDealModal);
    document.getElementById('cancelModalBtn').addEventListener('click', closeDealModal);
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeDealModal();
    });

    document.getElementById('dealForm').addEventListener('submit', saveDeal);
    document.getElementById('deleteDealBtn').addEventListener('click', deleteDeal);
    document.getElementById('addCommentBtn').addEventListener('click', addComment);
    document.getElementById('commentInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addComment(); }
    });

    document.getElementById('bellBtn').addEventListener('click', () => {
      const panel = document.getElementById('notifPanel');
      const isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) renderNotifications();
    });

    document.getElementById('closeNotifBtn').addEventListener('click', () => {
      document.getElementById('notifPanel').style.display = 'none';
    });

    document.addEventListener('click', (e) => {
      const panel = document.getElementById('notifPanel');
      const bell = document.getElementById('bellBtn');
      if (panel.style.display !== 'none' && !panel.contains(e.target) && !bell.contains(e.target)) {
        panel.style.display = 'none';
      }
    });

    document.getElementById('headerFilters').style.display = isBoss() ? 'flex' : 'none';
    document.getElementById('toolbar').style.display = 'flex';

    populateManagerFilter();
    populateStatusFilter();
    renderBoard();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

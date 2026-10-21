/*
  APPLICATION GUIDE — START HERE WHEN EDITING THE WEBSITE
  -------------------------------------------------------
  VISUAL TEXT / LABELS: Most public page text is in index.html.
  COLORS / SPACING: Edit css/styles.css, especially the :root variables.
  SERVICES: Change the sample list in DEMO_SERVICES below for preview mode; change real
            services from the Owner dashboard or the initial rows in supabase/schema.sql.
  DEMO BARBERS: Change DEMO_BARBERS below. These are previews only, not real staff records.
  CURRENCY: Change MONEY in this file if the project uses a different currency.
  TIMEZONE: The booking date/time logic and SQL schema currently use Asia/Manila.
  DATABASE: All real accounts and shared bookings require the Supabase setup in README.md.

  IMPORTANT: Never put a Supabase service_role key in a browser JavaScript file.
  The browser may contain only the public publishable/anon key with RLS enabled.
*/
(() => {
  'use strict';

  const CFG = window.BARBERSHOP_CONFIG || {};
  const configured = Boolean(
    CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY &&
    !CFG.SUPABASE_URL.includes('PASTE_') && !CFG.SUPABASE_ANON_KEY.includes('PASTE_')
  );
  const db = configured && window.supabase?.createClient
    ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  // CUSTOMIZE: Update these sample services for the visual preview shown before Supabase is connected.
  const DEMO_SERVICES = [
    { id: 'demo-cut', name: 'Classic Haircut', description: 'A clean, tailored haircut finished with a quick style.', price: 250, duration_minutes: 30, sort_order: 1, is_active: true },
    { id: 'demo-fade', name: 'Skin Fade', description: 'A precise fade with clean lines and a balanced finish.', price: 350, duration_minutes: 45, sort_order: 2, is_active: true },
    { id: 'demo-beard', name: 'Beard Trim', description: 'Shape, tidy, and define your beard with care.', price: 180, duration_minutes: 20, sort_order: 3, is_active: true },
    { id: 'demo-combo', name: 'Haircut + Beard', description: 'A complete refresh for your hair and beard.', price: 400, duration_minutes: 60, sort_order: 4, is_active: true },
    { id: 'demo-kids', name: 'Kids Haircut', description: 'A comfortable, tidy cut for younger customers.', price: 200, duration_minutes: 30, sort_order: 5, is_active: true },
    { id: 'demo-shave', name: 'Classic Shave', description: 'A careful traditional shave and finishing touch.', price: 220, duration_minutes: 30, sort_order: 6, is_active: true }
  ];
  // CUSTOMIZE: These names/bios are sample preview content. Replace with real profiles only with permission.
  const DEMO_BARBERS = [
    { id: 'demo-b1', display_name: 'Alex Rivera', bio: 'Classic cuts and careful fades.', specialties: ['Classic cuts', 'Fades'], is_active: true },
    { id: 'demo-b2', display_name: 'Marco Santos', bio: 'Clean lines, textured styles, and beard work.', specialties: ['Textured styles', 'Beards'], is_active: true },
    { id: 'demo-b3', display_name: 'Jules Mendoza', bio: 'Relaxed service and sharp everyday cuts.', specialties: ['Everyday cuts', 'Kids cuts'], is_active: true }
  ];
  const MONEY = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
  const $ = (id) => document.getElementById(id);
  const state = { session: null, profile: null, loginMode: 'customer', authView: 'login', services: [], barbers: [], reviews: [], selectedSlot: '', appointments: [] };
  let toastTimer = null;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const money = (amount) => MONEY.format(Number(amount || 0));
  const fullDate = (value) => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(value));
  const dayKey = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  const todayKey = () => dayKey(new Date());
  const defaultBookingDate = () => {
    const date = new Date(`${todayKey()}T12:00:00+08:00`);
    date.setUTCDate(date.getUTCDate() + 1);
    return dayKey(date);
  };
  const mondayOf = (key) => {
    const date = new Date(`${key}T12:00:00Z`);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    return date.toISOString().slice(0, 10);
  };
  const inSameMonth = (value, key) => dayKey(value).slice(0, 7) === key.slice(0, 7);
  const statusLabel = (status) => String(status || '').replaceAll('_', ' ');
  const initials = (name) => String(name || 'B').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
  const isDemo = () => !db;

  function showToast(message, kind = '') {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.className = `toast ${kind}`.trim();
    el.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { el.hidden = true; }, 4200);
  }
  function authMessage(message, kind = '') {
    const el = $('authMessage');
    if (!el) return;
    el.textContent = message;
    el.className = `auth-message ${kind}`.trim();
    el.hidden = !message;
  }
  function setAuthBusy(busy) {
    const button = $('authSubmitBtn');
    if (button) { button.disabled = busy; button.textContent = busy ? 'Please wait…' : (state.authView === 'signup' ? 'Create account →' : 'Sign in →'); }
  }
  function addPreviewBanner() {
    if (db) return;
    const banner = document.createElement('div');
    banner.className = 'preview-banner';
    banner.textContent = 'PREVIEW MODE — Connect your Supabase project to enable real accounts, live booking availability, and shared data.';
    document.body.prepend(banner);
  }
  function setAuthView(view) {
    state.authView = view;
    const signup = view === 'signup' && state.loginMode === 'customer';
    $('showLoginBtn')?.classList.toggle('active', view === 'login');
    $('showSignupBtn')?.classList.toggle('active', view === 'signup');
    $('nameField').hidden = !signup;
    $('phoneField').hidden = !signup;
    $('showSignupBtn').hidden = state.loginMode !== 'customer';
    $('authTitle').textContent = signup ? 'Make your account.' : (state.loginMode === 'staff' ? 'Staff sign in.' : 'Good to see you.');
    $('authEyebrow').textContent = signup ? 'NEW CUSTOMER' : (state.loginMode === 'staff' ? 'STAFF ACCESS' : 'WELCOME BACK');
    $('authIntro').textContent = signup ? 'Create an account to book and manage your appointments.' : 'Sign in to manage your next visit.';
    $('authNote').textContent = state.loginMode === 'staff'
      ? 'Staff accounts must be created by registering first or invited through Supabase, then assigned a role by the owner. Customer accounts cannot use staff access.'
      : 'New public sign-ups always start as customers. Staff roles are assigned by the owner.';
    $('authPassword').autocomplete = signup ? 'new-password' : 'current-password';
    $('authPassword').value = '';
    authMessage('');
    setAuthBusy(false);
  }
  function openAuth(mode = 'customer') {
    state.loginMode = mode;
    setAuthView('login');
    if (typeof $('authDialog').showModal === 'function') $('authDialog').showModal();
    else $('authDialog').setAttribute('open', '');
  }
  function closeAuth() {
    if ($('authDialog').open && typeof $('authDialog').close === 'function') $('authDialog').close();
    else $('authDialog').removeAttribute('open');
  }

  async function fetchPublicData() {
    if (!db) {
      state.services = DEMO_SERVICES;
      state.barbers = DEMO_BARBERS;
      state.reviews = [
        { id: 'demo-review-1', rating: 5, body: 'Easy to understand service menu and a simple way to plan a visit.', customerLabel: 'Sample review' },
        { id: 'demo-review-2', rating: 5, body: 'The idea is straightforward: choose the service, barber, and time before arriving.', customerLabel: 'Sample review' },
        { id: 'demo-review-3', rating: 4, body: 'A clearer schedule can make the visit easier to plan.', customerLabel: 'Sample review' }
      ];
      renderPublicData();
      return;
    }
    const [serviceResult, barberResult, reviewResult] = await Promise.all([
      db.from('services').select('id,name,description,price,duration_minutes,sort_order,is_active').eq('is_active', true).order('sort_order'),
      db.from('barbers').select('id,display_name,bio,specialties,is_active').eq('is_active', true).order('display_name'),
      db.from('reviews').select('id,rating,body,created_at').eq('status', 'approved').order('created_at', { ascending: false }).limit(6)
    ]);
    if (serviceResult.error) console.warn('Service list could not be loaded:', serviceResult.error.message);
    if (barberResult.error) console.warn('Barber list could not be loaded:', barberResult.error.message);
    if (reviewResult.error) console.warn('Review list could not be loaded:', reviewResult.error.message);
    state.services = serviceResult.data || [];
    state.barbers = barberResult.data || [];
    state.reviews = (reviewResult.data || []).map(r => ({ ...r, customerLabel: 'Verified customer' }));
    renderPublicData();
  }
  function renderPublicData() {
    $('serviceGrid').innerHTML = state.services.length ? state.services.map((service, index) => `
      <article class="service-card">
        <span class="service-no">${String(index + 1).padStart(2, '0')}</span>
        <div class="service-symbol" aria-hidden="true">✂</div>
        <h3>${esc(service.name)}</h3>
        <p>${esc(service.description || 'A carefully finished service from our barbershop team.')}</p>
        <div class="service-meta"><span>${money(service.price)}</span><span>${Number(service.duration_minutes)} min</span></div>
      </article>`).join('') : '<div class="empty-state">No services are published yet. The owner can add services from the Owner dashboard.</div>';
    $('barberGrid').innerHTML = state.barbers.length ? state.barbers.map(barber => `
      <article class="barber-card"><div class="barber-avatar" aria-hidden="true">${esc(initials(barber.display_name))}</div><div><h3>${esc(barber.display_name)}</h3><p>${esc(barber.bio || 'Ready to help with your next cut.')}</p><small>${esc((barber.specialties || []).join(' · ') || 'Barber')}</small></div></article>`).join('') : '<div class="empty-state">Barber profiles will appear here when the owner assigns staff accounts as barbers.</div>';
    $('reviewGrid').innerHTML = state.reviews.length ? state.reviews.map(review => `
      <article class="review-card"><div class="review-stars" aria-label="${Number(review.rating)} out of 5 stars">${'★'.repeat(Number(review.rating))}${'☆'.repeat(5 - Number(review.rating))}</div><blockquote>“${esc(review.body)}”</blockquote><small>${esc(review.customerLabel || 'Verified customer')}</small></article>`).join('') : '<div class="empty-state">No approved reviews yet. Customer reviews appear here after the shop approves them.</div>';
    if (isDemo()) {
      $('reviewGrid').insertAdjacentHTML('beforeend', '<p class="muted full-span">Sample reviews are shown for layout preview only. Replace them with real approved reviews before publishing.</p>');
    }
  }

  async function getProfile(user) {
    if (!db || !user) return null;
    const { data, error } = await db.from('profiles').select('id,email,full_name,phone,role,created_at').eq('id', user.id).single();
    if (error) { console.error('Could not load account profile:', error); return null; }
    return data;
  }
  async function applySession(session, shouldRender = true) {
    state.session = session || null;
    state.profile = session?.user ? await getProfile(session.user) : null;
    if (shouldRender) await renderDashboard();
  }
  async function refreshSession() {
    if (!db) return;
    const { data, error } = await db.auth.getSession();
    if (error) console.error(error);
    await applySession(data?.session || null);
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    if (!db) {
      authMessage('Supabase is not connected yet. Follow README.md to create a Supabase project, run supabase/schema.sql, and add the Project URL and public key in js/config.js. The sample page is preview-only.', 'notice-warning');
      return;
    }
    const email = $('authEmail').value.trim().toLowerCase();
    const password = $('authPassword').value;
    setAuthBusy(true);
    authMessage('');
    try {
      if (state.authView === 'signup') {
        if (state.loginMode !== 'customer') throw new Error('Only customers can create an account from the public sign-up page.');
        const fullName = $('authName').value.trim();
        const phone = $('authPhone').value.trim();
        if (!fullName) throw new Error('Enter your full name.');
        const { data, error } = await db.auth.signUp({
          email, password,
          options: { data: { full_name: fullName, phone }, emailRedirectTo: window.location.href.split('#')[0] }
        });
        if (error) throw error;
        if (!data.session) {
          authMessage('Account created. Check your email for the confirmation link, then return here to sign in.', 'notice-success');
          setAuthBusy(false);
        } else {
          closeAuth();
          await applySession(data.session);
          showToast('Your customer account is ready.', 'success');
        }
      } else {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const profile = await getProfile(data.user);
        if (!profile) { await db.auth.signOut(); throw new Error('Your profile could not be found. Contact the owner to check the account setup.'); }
        if (state.loginMode === 'staff' && !['admin', 'barber', 'owner'].includes(profile.role)) {
          await db.auth.signOut();
          throw new Error('This is a customer account. Use Customer Login instead.');
        }
        if (state.loginMode === 'customer' && profile.role !== 'customer') {
          await db.auth.signOut();
          throw new Error('This account is assigned to staff. Use Staff Login instead.');
        }
        closeAuth();
        await applySession(data.session);
        $('dashboardSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast(`Welcome, ${profile.full_name || 'back'}!`, 'success');
      }
    } catch (error) {
      authMessage(error.message || 'Something went wrong. Please try again.', 'notice-error');
      setAuthBusy(false);
    }
  }

  function statCard(label, value, note = '') {
    return `<article class="stat-card"><small>${esc(label)}</small><strong>${esc(value)}</strong>${note ? `<span class="muted">${esc(note)}</span>` : ''}</article>`;
  }
  function statusPill(status) { return `<span class="status-pill status-${esc(status)}">${esc(statusLabel(status))}</span>`; }
  function actionStatusOptions(role, current) {
    if (role === 'barber') {
      const allowed = current.status === 'confirmed' ? ['checked_in', 'no_show'] : current.status === 'checked_in' ? ['in_service', 'no_show'] : current.status === 'in_service' ? ['completed', 'no_show'] : [];
      if (!allowed.length) return '<span class="muted">Final status</span>';
      return `<select class="control" id="status-${esc(current.id)}" aria-label="Change appointment status">${allowed.map(s => `<option value="${s}">${esc(statusLabel(s))}</option>`).join('')}</select>`;
    }
    const statuses = ['confirmed', 'checked_in', 'in_service', 'completed', 'no_show', 'cancelled'];
    return `<select class="control" id="status-${esc(current.id)}" aria-label="Change appointment status">${statuses.map(s => `<option value="${s}" ${current.status === s ? 'selected' : ''}>${esc(statusLabel(s))}</option>`).join('')}</select>`;
  }
  function appointmentsTable(appointments, role, profiles = []) {
    if (!appointments.length) return '<div class="empty-state">No appointments to show yet.</div>';
    const profileMap = new Map(profiles.map(p => [p.id, p]));
    return `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Appointment</th>${role !== 'customer' ? '<th>Customer</th>' : ''}<th>Service / Barber</th><th>Price</th><th>Status</th>${role === 'admin' || role === 'owner' || role === 'barber' ? '<th>Update</th>' : '<th>Action</th>'}</tr></thead><tbody>${appointments.map(a => {
      const customer = profileMap.get(a.customer_id);
      const svc = a.services || {};
      const barber = a.barbers || {};
      let action = '<span class="muted">—</span>';
      if (role === 'customer' && a.status === 'confirmed' && new Date(a.starts_at).getTime() - Date.now() >= 24 * 60 * 60 * 1000) action = `<button class="button button-outline" data-action="cancel-booking" data-id="${esc(a.id)}">Cancel</button>`;
      else if (role === 'admin' || role === 'owner' || role === 'barber') action = `<div class="inline-form">${actionStatusOptions(role, a)}<button class="button button-dark" data-action="set-status" data-id="${esc(a.id)}">Save</button></div>`;
      return `<tr><td><strong>${esc(fullDate(a.starts_at))}</strong><br><small>${esc(a.id.slice(0, 8))}</small></td>${role !== 'customer' ? `<td>${esc(customer?.full_name || 'Customer')}<br><small>${esc(customer?.email || '')}</small></td>` : ''}<td>${esc(svc.name || 'Service')}<br><small>${esc(barber.display_name || 'Barber')}</small></td><td>${money(a.price_at_booking)}</td><td>${statusPill(a.status)}</td><td>${action}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  async function getAppointments(filters = {}) {
    let query = db.from('appointments').select('id,customer_id,service_id,barber_id,starts_at,ends_at,price_at_booking,status,created_at,services(name,price,duration_minutes),barbers(display_name,user_id)').order('starts_at', { ascending: false }).limit(150);
    if (filters.customer_id) query = query.eq('customer_id', filters.customer_id);
    if (filters.barber_id) query = query.eq('barber_id', filters.barber_id);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }
  async function getProfilesFor(appointments) {
    const ids = [...new Set(appointments.map(a => a.customer_id).filter(Boolean))];
    if (!ids.length) return [];
    const { data, error } = await db.from('profiles').select('id,full_name,email,phone,role').in('id', ids);
    if (error) { console.warn('Customer profile labels unavailable:', error.message); return []; }
    return data || [];
  }
  async function loadBookingsPanel(title, description, role, filters = {}) {
    const appointments = await getAppointments(filters);
    const profiles = role === 'customer' ? [] : await getProfilesFor(appointments);
    return `<section class="panel"><h3>${esc(title)}</h3><p class="panel-hint">${esc(description)}</p>${appointmentsTable(appointments, role, profiles)}</section>`;
  }
  function customerBookingForm() {
    const svcOptions = state.services.filter(s => s.is_active).map(s => `<option value="${esc(s.id)}">${esc(s.name)} — ${money(s.price)} / ${Number(s.duration_minutes)} min</option>`).join('');
    const barberOptions = state.barbers.filter(b => b.is_active).map(b => `<option value="${esc(b.id)}">${esc(b.display_name)}</option>`).join('');
    return `<section class="panel"><h3>Book an appointment</h3><p class="panel-hint">Choose a service, barber, and date. Available times are loaded from the shop schedule. The database checks the slot again when you confirm.</p><form id="bookingForm"><div class="booking-form-grid"><label class="field"><span>Service</span><select id="bookingService" name="service_id" required ${!svcOptions ? 'disabled' : ''}><option value="">Select a service</option>${svcOptions}</select></label><label class="field"><span>Barber</span><select id="bookingBarber" name="barber_id" required ${!barberOptions ? 'disabled' : ''}><option value="">Select a barber</option>${barberOptions}</select></label><label class="field"><span>Date</span><input id="bookingDate" name="booking_date" type="date" min="${todayKey()}" value="${defaultBookingDate()}" required></label><div class="field"><span>Available time</span><select id="bookingSlot" name="slot_start" required disabled><option value="">Choose service, barber, and date first</option></select></div><label class="field full-span"><span>Note for the barber (optional)</span><textarea name="notes" maxlength="300" placeholder="Anything the barber should know?"></textarea></label><div class="full-span form-actions"><button class="button button-accent" type="submit" ${!svcOptions || !barberOptions ? 'disabled' : ''}>Confirm booking →</button><span class="slot-help">Booking is confirmed only after the database accepts it.</span></div></div></form></section>`;
  }
  async function refreshSlots() {
    const select = $('bookingSlot');
    if (!select) return;
    const serviceId = $('bookingService')?.value;
    const barberId = $('bookingBarber')?.value;
    const date = $('bookingDate')?.value;
    state.selectedSlot = '';
    select.disabled = true;
    select.innerHTML = '<option value="">Loading available times…</option>';
    if (!serviceId || !barberId || !date || !db) {
      select.innerHTML = `<option value="">${!db ? 'Connect Supabase to load live times' : 'Choose service, barber, and date first'}</option>`;
      return;
    }
    const { data, error } = await db.rpc('get_available_slots', { p_service_id: serviceId, p_barber_id: barberId, p_date: date });
    if (error) {
      console.error(error);
      select.innerHTML = '<option value="">Could not load times — check database setup</option>';
      return;
    }
    if (!data?.length) {
      select.innerHTML = '<option value="">No available times on this date</option>';
      return;
    }
    select.innerHTML = `<option value="">Choose a time</option>${data.map(slot => `<option value="${esc(slot.slot_start)}">${esc(new Intl.DateTimeFormat('en-PH', { timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(slot.slot_start)))}</option>`).join('')}`;
    select.disabled = false;
  }
  async function renderCustomerDashboard() {
    $('dashboardTitle').textContent = `Welcome, ${state.profile.full_name || 'Customer'}`;
    $('dashboardSubtitle').textContent = 'Your appointments and personal booking details.';
    const appointments = await getAppointments({ customer_id: state.session.user.id });
    state.appointments = appointments;
    const upcoming = appointments.filter(a => ['confirmed', 'checked_in', 'in_service'].includes(a.status) && new Date(a.starts_at) >= new Date()).length;
    const reviewsResult = await db.from('reviews').select('appointment_id').eq('customer_id', state.session.user.id);
    const reviewed = new Set((reviewsResult.data || []).map(r => r.appointment_id));
    const reviewForms = appointments.filter(a => a.status === 'completed' && !reviewed.has(a.id));
    $('dashboardContent').innerHTML = `<div class="dashboard-grid">${statCard('Total bookings', appointments.length)}${statCard('Upcoming visits', upcoming)}${statCard('Reviews to leave', reviewForms.length)}</div>${customerBookingForm()}<section class="panel"><h3>Your appointments</h3><p class="panel-hint">Cancellations are available at least 24 hours before the appointment. Completed visits can be reviewed once.</p>${appointmentsTable(appointments, 'customer')}</section>${reviewForms.length ? `<section class="panel"><h3>Leave a review</h3><p class="panel-hint">Reviews are checked by the shop before they appear publicly.</p><div class="list-stack">${reviewForms.map(a => `<form class="review-form list-row" data-appointment-id="${esc(a.id)}"><div class="list-row-main"><strong>${esc(a.services?.name || 'Service')} with ${esc(a.barbers?.display_name || 'barber')}</strong><small>${esc(fullDate(a.starts_at))}</small></div><div class="list-row-actions"><select name="rating" aria-label="Rating" required><option value="5">5 stars</option><option value="4">4 stars</option><option value="3">3 stars</option><option value="2">2 stars</option><option value="1">1 star</option></select><input name="body" maxlength="500" required placeholder="Write a short review" aria-label="Review text"><button class="button button-dark" type="submit">Submit</button></div></form>`).join('')}</div></section>` : ''}`;
  }
  async function renderBarberDashboard() {
    const { data: barber, error } = await db.from('barbers').select('id,user_id,display_name,is_active').eq('user_id', state.session.user.id).single();
    if (error || !barber) { $('dashboardContent').innerHTML = '<div class="notice notice-warning">Your account has the Barber role, but its barber profile is missing. Ask the owner to open Staff Accounts, re-save your role as Barber, and check the profile.</div>'; return; }
    const [appointments, payResult] = await Promise.all([
      getAppointments({ barber_id: barber.id }),
      db.from('pay_settings').select('pay_type,base_monthly_salary,commission_rate').eq('barber_id', barber.id).single()
    ]);
    state.appointments = appointments;
    const pay = payResult.data || { pay_type: 'commission', base_monthly_salary: 0, commission_rate: 0 };
    const completed = appointments.filter(a => a.status === 'completed');
    const today = todayKey(); const week = mondayOf(today); const month = today.slice(0, 7);
    const earned = a => ['commission','both'].includes(pay.pay_type) ? Number(a.price_at_booking || 0) * Number(pay.commission_rate || 0) / 100 : 0;
    const dayTotal = completed.filter(a => dayKey(a.starts_at) === today).reduce((sum, a) => sum + earned(a), 0);
    const weekTotal = completed.filter(a => dayKey(a.starts_at) >= week && dayKey(a.starts_at) <= today).reduce((sum, a) => sum + earned(a), 0);
    const monthTotal = completed.filter(a => inSameMonth(a.starts_at, today)).reduce((sum, a) => sum + earned(a), 0);
    $('dashboardTitle').textContent = `Barber dashboard — ${barber.display_name}`;
    $('dashboardSubtitle').textContent = 'Your schedule, assigned bookings, and earnings estimate.';
    $('dashboardContent').innerHTML = `<div class="dashboard-grid">${statCard('Today: commission', money(dayTotal))}${statCard('This week: commission', money(weekTotal))}${statCard('This month: commission', money(monthTotal))}${statCard('Fixed monthly pay', money(pay.base_monthly_salary), pay.pay_type === 'fixed' ? 'Configured by owner' : 'Shown separately')}</div><section class="panel"><h3>Your assigned bookings</h3><p class="panel-hint">Update the appointment status as the customer arrives and the service is completed. Commission estimates use completed services only.</p>${appointmentsTable(appointments, 'barber')}</section><div class="notice">Earnings shown here are estimates from the recorded booking price and owner-configured pay settings. Confirm final payroll with the owner.</div>`;
  }
  function availabilityPanel(rows) {
    const dayNames = {1:'Monday',2:'Tuesday',3:'Wednesday',4:'Thursday',5:'Friday',6:'Saturday',7:'Sunday'};
    if (!rows.length) return '<div class="empty-state">No barber availability rows found. Re-save each Barber role from the Owner dashboard to create default availability.</div>';
    return `<section class="panel"><h3>Barber availability</h3><p class="panel-hint">Change working hours, break times, or mark a day unavailable. Times use Manila local time. Availability changes affect new bookings; check existing bookings before changing a shift.</p><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Barber / Day</th><th>Opens</th><th>Closes</th><th>Break starts</th><th>Break ends</th><th>Open?</th><th>Save</th></tr></thead><tbody>${rows.map(r => `<tr><td><strong>${esc(r.barbers?.display_name || 'Barber')}</strong><br><small>${dayNames[r.iso_weekday] || r.iso_weekday}</small></td><td><input id="av-start-${esc(r.id)}" type="time" value="${esc(String(r.start_time).slice(0,5))}" aria-label="Start time"></td><td><input id="av-end-${esc(r.id)}" type="time" value="${esc(String(r.end_time).slice(0,5))}" aria-label="End time"></td><td><input id="av-break-start-${esc(r.id)}" type="time" value="${esc(r.break_start ? String(r.break_start).slice(0,5) : '')}" aria-label="Break start"></td><td><input id="av-break-end-${esc(r.id)}" type="time" value="${esc(r.break_end ? String(r.break_end).slice(0,5) : '')}" aria-label="Break end"></td><td><input id="av-open-${esc(r.id)}" type="checkbox" ${r.is_available ? 'checked' : ''} aria-label="Available this day"></td><td><button class="button button-dark" data-action="save-availability" data-id="${esc(r.id)}">Save</button></td></tr>`).join('')}</tbody></table></div></section>`;
  }

  async function renderAdminDashboard() {
    $('dashboardTitle').textContent = 'Admin dashboard';
    $('dashboardSubtitle').textContent = 'Manage day-to-day appointments, barber schedules, and review submissions.';
    const [appointments, reviewsResult, availabilityResult] = await Promise.all([
      getAppointments(),
      db.from('reviews').select('id,appointment_id,customer_id,rating,body,status,created_at').order('created_at', { ascending: false }).limit(100),
      db.from('barber_availability').select('id,barber_id,iso_weekday,start_time,end_time,break_start,break_end,is_available,barbers(display_name)').order('barber_id').order('iso_weekday')
    ]);
    state.appointments = appointments;
    const profiles = await getProfilesFor(appointments);
    const pendingReviews = reviewsResult.data || [];
    $('dashboardContent').innerHTML = `<div class="dashboard-grid">${statCard('All loaded bookings', appointments.length)}${statCard('Confirmed', appointments.filter(a => a.status === 'confirmed').length)}${statCard('Completed', appointments.filter(a => a.status === 'completed').length)}</div><section class="panel"><h3>Appointment management</h3><p class="panel-hint">Use the status selector to keep the schedule up to date. Changes are validated by the database.</p>${appointmentsTable(appointments, 'admin', profiles)}</section>${availabilityPanel(availabilityResult.data || [])}<section class="panel"><h3>Review moderation</h3><p class="panel-hint">Only approved reviews appear on the public homepage. Do not approve spam or personal information.</p>${pendingReviews.length ? `<div class="list-stack">${pendingReviews.map(r => { const customer = profiles.find(p => p.id === r.customer_id); return `<div class="list-row"><div class="list-row-main"><strong>${'★'.repeat(Number(r.rating))}${'☆'.repeat(5 - Number(r.rating))} · ${esc(customer?.full_name || 'Customer')}</strong><small>${esc(r.body)} · ${esc(fullDate(r.created_at))}</small><small>Status: ${esc(statusLabel(r.status))}</small></div><div class="list-row-actions">${r.status !== 'approved' ? `<button class="button button-dark" data-action="review-status" data-id="${esc(r.id)}" data-status="approved">Approve</button>` : ''}${r.status !== 'rejected' ? `<button class="button button-outline" data-action="review-status" data-id="${esc(r.id)}" data-status="rejected">Reject</button>` : ''}</div></div>`; }).join('')}</div>` : '<div class="empty-state">No customer reviews have been submitted.</div>'}</section>`;
  }
  async function renderOwnerDashboard() {
    $('dashboardTitle').textContent = 'Owner dashboard';
    $('dashboardSubtitle').textContent = 'Business activity, team access, service menu, and recorded expenses.';
    const [appointments, profilesResult, serviceResult, barberResult, payResult, expenseResult, availabilityResult] = await Promise.all([
      getAppointments(),
      db.from('profiles').select('id,email,full_name,phone,role,created_at').order('created_at', { ascending: false }).limit(200),
      db.from('services').select('*').order('sort_order'),
      db.from('barbers').select('id,user_id,display_name,bio,specialties,is_active,created_at,updated_at').order('display_name'),
      db.from('pay_settings').select('*'),
      db.from('expenses').select('*').order('expense_date', { ascending: false }).limit(200),
      db.from('barber_availability').select('id,barber_id,iso_weekday,start_time,end_time,break_start,break_end,is_available,barbers(display_name)').order('barber_id').order('iso_weekday')
    ]);
    const problems = [profilesResult, serviceResult, barberResult, payResult, expenseResult].filter(r => r.error);
    if (problems.length) console.warn('Some owner dashboard data did not load:', problems.map(p => p.error.message));
    const profiles = profilesResult.data || [];
    const services = serviceResult.data || [];
    const barbers = barberResult.data || [];
    const pays = payResult.data || [];
    const expenses = expenseResult.data || [];
    state.appointments = appointments;
    const monthKey = todayKey().slice(0, 7);
    const monthBookings = appointments.filter(a => inSameMonth(a.starts_at, todayKey()));
    const revenue = monthBookings.filter(a => a.status === 'completed').reduce((sum, a) => sum + Number(a.price_at_booking || 0), 0);
    const expenseTotal = expenses.filter(e => String(e.expense_date).slice(0, 7) === monthKey).reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const payrollEstimate = pays.reduce((sum, p) => sum + (['fixed','both'].includes(p.pay_type) ? Number(p.base_monthly_salary || 0) : 0), 0) + monthBookings.filter(a => a.status === 'completed').reduce((sum, a) => {
      const p = pays.find(x => x.barber_id === a.barber_id);
      const commission = ['commission','both'].includes(p?.pay_type) ? Number(p.commission_rate || 0) : 0;
      return sum + Number(a.price_at_booking || 0) * commission / 100;
    }, 0);
    const serviceEditor = services.map(s => `<form class="service-edit-form list-row" data-id="${esc(s.id)}"><div class="list-row-main" style="flex:1"><input name="name" aria-label="Service name" value="${esc(s.name)}" required maxlength="100"><input name="description" aria-label="Service description" value="${esc(s.description || '')}" maxlength="240" placeholder="Description"><small>${esc(s.is_active ? 'Published' : 'Hidden')} · ${money(s.price)} · ${Number(s.duration_minutes)} min</small></div><div class="list-row-actions"><input name="price" type="number" min="0" step="1" value="${Number(s.price)}" aria-label="Price" style="width:95px"><input name="duration_minutes" type="number" min="5" step="5" value="${Number(s.duration_minutes)}" aria-label="Duration minutes" style="width:85px"><button class="button button-dark" type="submit">Save</button><button class="button button-outline" type="button" data-action="service-active" data-id="${esc(s.id)}" data-active="${!s.is_active}">${s.is_active ? 'Hide' : 'Publish'}</button></div></form>`).join('');
    const staffEditor = profiles.map(p => `<div class="list-row"><div class="list-row-main"><strong>${esc(p.full_name || 'Unnamed account')}</strong><small>${esc(p.email)} · ${esc(p.role)} · ${esc(p.phone || 'No phone')}</small></div><div class="list-row-actions"><select id="role-${esc(p.id)}" aria-label="Role for ${esc(p.email)}"><option value="customer" ${p.role === 'customer' ? 'selected' : ''}>Customer</option><option value="barber" ${p.role === 'barber' ? 'selected' : ''}>Barber</option><option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Admin</option><option value="owner" ${p.role === 'owner' ? 'selected' : ''}>Owner</option></select><button class="button button-dark" data-action="save-role" data-id="${esc(p.id)}">Save role</button></div></div>`).join('');
    const barberEditor = barbers.map(b => { const p = profiles.find(x => x.id === b.user_id); const pay = pays.find(x => x.barber_id === b.id) || {}; return `<div class="panel"><form class="barber-edit-form" data-id="${esc(b.id)}"><div class="split-heading"><h3>${esc(p?.full_name || b.display_name)}</h3><small>${esc(b.is_active ? 'Active' : 'Hidden')}</small></div><div class="form-grid"><label class="field"><span>Public display name</span><input name="display_name" value="${esc(b.display_name)}" required maxlength="80"></label><label class="field"><span>Specialties (comma-separated)</span><input name="specialties" value="${esc((b.specialties || []).join(', '))}" placeholder="Fades, classic cuts"></label><label class="field full-span"><span>Short bio</span><input name="bio" value="${esc(b.bio || '')}" maxlength="220"></label></div><button class="button button-dark" type="submit">Save barber profile</button></form><div class="divider-space" style="height:15px"></div><div class="split-heading"><strong>Pay settings</strong><small>Commission calculated from completed services</small></div><div class="staff-settings-row"><div><strong>Pay type</strong><small>Fixed, commission, or both</small></div><select id="pay-type-${esc(b.id)}" aria-label="Pay type"><option value="commission" ${pay.pay_type === 'commission' ? 'selected' : ''}>Commission</option><option value="fixed" ${pay.pay_type === 'fixed' ? 'selected' : ''}>Fixed salary</option><option value="both" ${pay.pay_type === 'both' ? 'selected' : ''}>Both</option></select><div><input id="pay-salary-${esc(b.id)}" type="number" min="0" step="100" value="${Number(pay.base_monthly_salary || 0)}" aria-label="Monthly base salary" placeholder="Monthly salary"></div><div><input id="pay-rate-${esc(b.id)}" type="number" min="0" max="100" step="0.5" value="${Number(pay.commission_rate ?? 0)}" aria-label="Commission percent" placeholder="Commission %"></div></div><button class="button button-outline" data-action="save-pay" data-id="${esc(b.id)}">Save pay settings</button></div>`; }).join('');
    const expenseRows = expenses.length ? expenses.map(e => `<div class="list-row"><div class="list-row-main"><strong>${esc(e.category)}</strong><small>${esc(e.description || '')} · ${esc(e.expense_date)}</small></div><strong>${money(e.amount)}</strong></div>`).join('') : '<div class="empty-state">No expenses have been recorded.</div>';
    $('dashboardContent').innerHTML = `<div class="dashboard-grid">${statCard('Completed-service revenue', money(revenue), monthKey)}${statCard('Recorded expenses', money(expenseTotal), monthKey)}${statCard('Estimated payroll', money(payrollEstimate), 'Base pay + service commission')}${statCard('Estimated operating remainder', money(revenue - expenseTotal - payrollEstimate), 'Before unrecorded costs and taxes')}${statCard('Bookings this month', monthBookings.length)}${statCard('Staff accounts', profiles.filter(p => ['admin', 'barber', 'owner'].includes(p.role)).length)}</div><div class="notice notice-warning">Figures depend on the records entered in the system. They are management estimates, not audited accounting or tax figures.</div><section class="panel"><h3>Service menu</h3><p class="panel-hint">Edit names, descriptions, prices, and durations. Hiding a service prevents new bookings without deleting past records.</p><form id="serviceCreateForm" class="panel" style="margin:0 0 14px;background:#f8f6f0"><div class="form-grid"><label class="field"><span>New service name</span><input name="name" required maxlength="100"></label><label class="field"><span>Price (PHP)</span><input name="price" type="number" min="0" step="1" required></label><label class="field"><span>Duration (minutes)</span><input name="duration_minutes" type="number" min="5" step="5" value="30" required></label><label class="field"><span>Description</span><input name="description" maxlength="240"></label></div><button class="button button-accent" type="submit">Add service</button></form><div class="list-stack">${serviceEditor || '<div class="empty-state">No services created yet.</div>'}</div></section><section class="panel"><h3>Staff accounts</h3><p class="panel-hint">A new account starts as a customer. Assign Barber or Admin only after confirming who owns the account. Only the Owner can change roles.</p><div class="list-stack">${staffEditor || '<div class="empty-state">No profiles found.</div>'}</div></section><section class="panel"><h3>Barber profiles and pay settings</h3><p class="panel-hint">A profile is created when an account is assigned the Barber role. Adjust working details in the SQL availability table if the default schedule needs to change.</p>${barberEditor || '<div class="empty-state">Assign an account the Barber role first. Then its public profile and pay settings appear here.</div>'}</section><section class="panel"><h3>Record an expense</h3><form id="expenseForm" class="form-grid"><label class="field"><span>Date</span><input type="date" name="expense_date" value="${todayKey()}" required></label><label class="field"><span>Category</span><select name="category"><option>Supplies</option><option>Rent</option><option>Utilities</option><option>Equipment</option><option>Maintenance</option><option>Other</option></select></label><label class="field"><span>Amount (PHP)</span><input type="number" name="amount" min="0.01" step="0.01" required></label><label class="field"><span>Description</span><input name="description" maxlength="200" placeholder="Optional detail"></label><div class="full-span"><button class="button button-accent" type="submit">Save expense</button></div></form><div class="list-stack" style="margin-top:15px">${expenseRows}</div></section>${availabilityPanel(availabilityResult.data || [])}<section class="panel"><h3>All appointments</h3><p class="panel-hint">Latest 150 records. Use this table for daily oversight and status correction.</p>${appointmentsTable(appointments, 'owner', profiles)}</section>`;
  }
  async function renderDashboard() {
    const section = $('dashboardSection');
    if (!state.session || !state.profile) {
      section.hidden = true;
      $('dashboardContent').innerHTML = '';
      return;
    }
    section.hidden = false;
    $('dashboardContent').innerHTML = '<div class="loading-text">Loading your dashboard…</div>';
    try {
      if (state.profile.role === 'customer') await renderCustomerDashboard();
      else if (state.profile.role === 'barber') await renderBarberDashboard();
      else if (state.profile.role === 'admin') await renderAdminDashboard();
      else if (state.profile.role === 'owner') await renderOwnerDashboard();
      else $('dashboardContent').innerHTML = '<div class="notice notice-warning">This account has an unrecognized role. Ask the owner to review the account settings.</div>';
    } catch (error) {
      console.error('Dashboard could not load:', error);
      $('dashboardContent').innerHTML = `<div class="notice notice-error">The dashboard could not load: ${esc(error.message || 'Unexpected error')}. Check that supabase/schema.sql ran successfully and that this account has the correct role.</div>`;
    }
  }

  async function handleBookingSubmit(form) {
    if (!db) { showToast('Connect Supabase first. See README.md for the setup steps.', 'error'); return; }
    const formData = new FormData(form);
    const serviceId = formData.get('service_id');
    const barberId = formData.get('barber_id');
    const slot = formData.get('slot_start');
    if (!serviceId || !barberId || !slot) { showToast('Choose a service, barber, date, and available time.', 'error'); return; }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = 'Confirming…';
    const { data, error } = await db.rpc('book_appointment', { p_service_id: serviceId, p_barber_id: barberId, p_start: slot, p_notes: String(formData.get('notes') || '').trim() || null });
    submit.disabled = false; submit.textContent = 'Confirm booking →';
    if (error) { showToast(error.message || 'The booking could not be saved. Select another time.', 'error'); await refreshSlots(); return; }
    showToast('Your appointment is booked.', 'success');
    await renderDashboard();
  }
  async function handleCancel(id) {
    const ok = window.confirm('Cancel this booking? The system allows customer cancellation only at least 24 hours before the start time.');
    if (!ok) return;
    const { error } = await db.rpc('cancel_my_booking', { p_appointment_id: id });
    if (error) showToast(error.message || 'Could not cancel booking.', 'error');
    else { showToast('Booking cancelled.', 'success'); await renderDashboard(); }
  }
  async function handleStatusUpdate(id) {
    const select = $(`status-${id}`);
    if (!select) return;
    const { error } = await db.rpc('set_appointment_status', { p_appointment_id: id, p_status: select.value });
    if (error) showToast(error.message || 'Could not update the booking status.', 'error');
    else { showToast('Appointment status updated.', 'success'); await renderDashboard(); }
  }
  async function handleReviewSubmit(form) {
    const formData = new FormData(form);
    const appointmentId = form.dataset.appointmentId;
    const rating = Number(formData.get('rating'));
    const body = String(formData.get('body') || '').trim();
    if (!body) { showToast('Write a short review first.', 'error'); return; }
    const { error } = await db.from('reviews').insert({ appointment_id: appointmentId, customer_id: state.session.user.id, rating, body });
    if (error) showToast(error.message || 'Could not submit the review.', 'error');
    else { showToast('Review submitted for approval.', 'success'); await renderDashboard(); }
  }
  async function handleOwnerServiceCreate(form) {
    const d = new FormData(form);
    const { error } = await db.from('services').insert({ name: String(d.get('name')).trim(), description: String(d.get('description') || '').trim(), price: Number(d.get('price')), duration_minutes: Number(d.get('duration_minutes')), sort_order: state.services.length + 1, is_active: true });
    if (error) showToast(error.message || 'Could not add service.', 'error');
    else { showToast('Service added.', 'success'); await fetchPublicData(); await renderDashboard(); }
  }
  async function handleOwnerServiceEdit(form) {
    const d = new FormData(form); const id = form.dataset.id;
    const patch = { name: String(d.get('name')).trim(), description: String(d.get('description') || '').trim(), price: Number(d.get('price')), duration_minutes: Number(d.get('duration_minutes')), updated_at: new Date().toISOString() };
    const { error } = await db.from('services').update(patch).eq('id', id);
    if (error) showToast(error.message || 'Could not update service.', 'error');
    else { showToast('Service updated.', 'success'); await fetchPublicData(); await renderDashboard(); }
  }
  async function handleBarberEdit(form) {
    const d = new FormData(form); const id = form.dataset.id;
    const specialties = String(d.get('specialties') || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 10);
    const { error } = await db.from('barbers').update({ display_name: String(d.get('display_name')).trim(), bio: String(d.get('bio') || '').trim(), specialties, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) showToast(error.message || 'Could not update barber profile.', 'error');
    else { showToast('Barber profile saved.', 'success'); await fetchPublicData(); await renderDashboard(); }
  }
  async function handleExpenseSubmit(form) {
    const d = new FormData(form);
    const { error } = await db.from('expenses').insert({ expense_date: d.get('expense_date'), category: d.get('category'), amount: Number(d.get('amount')), description: String(d.get('description') || '').trim() || null, created_by: state.session.user.id });
    if (error) showToast(error.message || 'Could not save expense.', 'error');
    else { showToast('Expense recorded.', 'success'); await renderDashboard(); }
  }

  // Event wiring: delegated handlers keep buttons working after the dashboard HTML is refreshed.
  $('customerLoginBtn').addEventListener('click', () => openAuth('customer'));
  $('staffLoginBtn').addEventListener('click', () => openAuth('staff'));
  $('heroBookBtn').addEventListener('click', () => state.profile ? $('dashboardSection').scrollIntoView({ behavior: 'smooth' }) : openAuth('customer'));
  $('bannerBookBtn').addEventListener('click', () => state.profile ? $('dashboardSection').scrollIntoView({ behavior: 'smooth' }) : openAuth('customer'));
  $('closeAuthBtn').addEventListener('click', closeAuth);
  $('showLoginBtn').addEventListener('click', () => setAuthView('login'));
  $('showSignupBtn').addEventListener('click', () => state.loginMode === 'customer' && setAuthView('signup'));
  $('authForm').addEventListener('submit', handleAuthSubmit);
  $('signOutBtn').addEventListener('click', async () => {
    if (!db) return;
    const { error } = await db.auth.signOut();
    if (error) showToast(error.message, 'error');
    await applySession(null);
    showToast('You are signed out.');
  });
  $('navToggle').addEventListener('click', () => {
    const nav = $('mainNav'); const open = nav.classList.toggle('open');
    $('navToggle').setAttribute('aria-expanded', String(open));
    $('navToggle').setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  });
  $('mainNav').querySelectorAll('a').forEach(a => a.addEventListener('click', () => $('mainNav').classList.remove('open')));
  $('dashboardContent').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.target;
    if (form.id === 'bookingForm') return handleBookingSubmit(form);
    if (form.classList.contains('review-form')) return handleReviewSubmit(form);
    if (form.id === 'serviceCreateForm') return handleOwnerServiceCreate(form);
    if (form.classList.contains('service-edit-form')) return handleOwnerServiceEdit(form);
    if (form.classList.contains('barber-edit-form')) return handleBarberEdit(form);
    if (form.id === 'expenseForm') return handleExpenseSubmit(form);
  });
  $('dashboardContent').addEventListener('change', (event) => {
    if (['bookingService', 'bookingBarber', 'bookingDate'].includes(event.target.id)) refreshSlots();
  });
  $('dashboardContent').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const action = button.dataset.action; const id = button.dataset.id;
    button.disabled = true;
    try {
      if (action === 'cancel-booking') await handleCancel(id);
      else if (action === 'set-status') await handleStatusUpdate(id);
      else if (action === 'review-status') {
        const { error } = await db.from('reviews').update({ status: button.dataset.status, moderated_by: state.session.user.id, moderated_at: new Date().toISOString() }).eq('id', id);
        if (error) showToast(error.message || 'Could not moderate review.', 'error'); else { showToast('Review status updated.', 'success'); await renderDashboard(); await fetchPublicData(); }
      } else if (action === 'save-role') {
        const role = $(`role-${id}`)?.value;
        const { error } = await db.rpc('owner_set_staff_role', { p_user_id: id, p_role: role });
        if (error) showToast(error.message || 'Could not change role.', 'error'); else { showToast('Account role updated.', 'success'); await renderDashboard(); await fetchPublicData(); }
      } else if (action === 'service-active') {
        const { error } = await db.from('services').update({ is_active: button.dataset.active === 'true', updated_at: new Date().toISOString() }).eq('id', id);
        if (error) showToast(error.message || 'Could not update service visibility.', 'error'); else { showToast('Service visibility updated.', 'success'); await fetchPublicData(); await renderDashboard(); }
      } else if (action === 'save-availability') {
        const start = $(`av-start-${id}`).value; const end = $(`av-end-${id}`).value;
        const breakStart = $(`av-break-start-${id}`).value; const breakEnd = $(`av-break-end-${id}`).value;
        if (!start || !end || start >= end || Boolean(breakStart) !== Boolean(breakEnd) || (breakStart && (breakStart >= breakEnd || breakStart < start || breakEnd > end))) {
          showToast('Check the hours. Closing time must be later than opening time, and break times must be a complete range within the shift.', 'error'); return;
        }
        const { error } = await db.from('barber_availability').update({ start_time: start, end_time: end, break_start: breakStart || null, break_end: breakEnd || null, is_available: $(`av-open-${id}`).checked }).eq('id', id);
        if (error) showToast(error.message || 'Could not save availability.', 'error'); else { showToast('Barber availability saved.', 'success'); await renderDashboard(); }
      } else if (action === 'save-pay') {
        const patch = { barber_id: id, pay_type: $(`pay-type-${id}`).value, base_monthly_salary: Number($(`pay-salary-${id}`).value || 0), commission_rate: Number($(`pay-rate-${id}`).value || 0), updated_at: new Date().toISOString() };
        const { error } = await db.from('pay_settings').upsert(patch, { onConflict: 'barber_id' });
        if (error) showToast(error.message || 'Could not save pay settings.', 'error'); else { showToast('Pay settings saved.', 'success'); await renderDashboard(); }
      }
    } finally { if (button.isConnected) button.disabled = false; }
  });

  addPreviewBanner();
  fetchPublicData();
  if (db) {
    db.auth.onAuthStateChange((_event, session) => {
      // Defer Supabase queries to avoid doing network calls inside its auth callback lock.
      window.setTimeout(() => applySession(session), 0);
    });
    refreshSession();
  }
})();

const API = (window.YUXORO_API_URL || window.location.origin).replace(/\/$/, '');
let currentLang = 'en';
let lastScrollY = 0;
let lastMaintenanceState = null;
const EGP = new Intl.NumberFormat('en-EG');
const planPrices = { starter: 15000, growth: 28000, pro: 50000 };
const customPrices = { website: 12000, scripts_video: 8000, graphics: 4000, app_mvp: 60000 };
let selectedPlan = 'starter';

async function updateMaintenanceState() {
  try {
    const response = await fetch(`${API}/api/site-status`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    const enabled = Boolean(data.maintenanceMode);
    const overlay = document.getElementById('maintenance-overlay');
    if (!overlay) return;
    document.body.classList.toggle('maintenance-mode', enabled);
    overlay.hidden = !enabled;
    document.querySelectorAll('body > *:not(#maintenance-overlay)').forEach(element => {
      element.inert = enabled;
    });
    if (enabled && lastMaintenanceState !== true) overlay.focus();
    lastMaintenanceState = enabled;
  } catch {
    // Keep the public website usable if the status endpoint is temporarily unavailable.
  }
}

updateMaintenanceState();
window.setInterval(updateMaintenanceState, 4000);

// ── NAV HIDE ON SCROLL ──────────────────────────────────────────
const nav = document.getElementById('main-nav');
window.addEventListener('scroll', () => {
  const currentScrollY = window.scrollY;
  if (currentScrollY > lastScrollY && currentScrollY > 100) {
    nav.style.transform = 'translateY(-120px)';
  } else {
    nav.style.transform = 'translateY(0)';
  }
  lastScrollY = currentScrollY;
}, { passive: true });

// ── VIDEO NAVIGATION ────────────────────────────────────────────
const videos = ['./showreel.mp4'];
let videoIndex = 0;

function nextVideo() {
  videoIndex = (videoIndex + 1) % videos.length;
  document.getElementById('reel-video').src = videos[videoIndex];
}

function prevVideo() {
  videoIndex = (videoIndex - 1 + videos.length) % videos.length;
  document.getElementById('reel-video').src = videos[videoIndex];
}

// ── ARROW VISIBILITY (SHOW WHEN PLAYING, HIDE WHEN PAUSED) ─────────
window.addEventListener('load', () => {
  const videoEl = document.getElementById('reel-video');
  if (videoEl) {
    videoEl.src = videos[0];
    videoEl.addEventListener('play', () => {
      document.querySelectorAll('.reel-arrow').forEach(a => a.style.opacity = '1');
    });
    videoEl.addEventListener('pause', () => {
      document.querySelectorAll('.reel-arrow').forEach(a => a.style.opacity = '0');
    });
    videoEl.addEventListener('ended', () => {
      document.querySelectorAll('.reel-arrow').forEach(a => a.style.opacity = '0');
    });
    document.querySelectorAll('.reel-arrow').forEach(a => a.style.opacity = '0');
  }
});

// ── CUSTOM PLAN ─────────────────────────────────────────────────
function updateCustomPrice() {
  const addons = getSelectedAddons();
  const total = 3000 + addons.reduce((sum, addon) => sum + customPrices[addon], 0);
  document.getElementById('custom-price').textContent = EGP.format(total);
  return total;
}

function getSelectedAddons() {
  return [...document.querySelectorAll('.custom-options input[data-addon]:checked')]
    .map(input => input.dataset.addon);
}

function getPlanAmount(plan) {
  return plan === 'custom'
    ? updateCustomPrice()
    : planPrices[plan];
}

// ── CHECKOUT ────────────────────────────────────────────────────
function checkout(plan) {
  selectedPlan = plan;
  const amount = getPlanAmount(plan);
  const selectedNames = getSelectedAddons().map(addon => i18n[currentLang][`addon_${addon}`]);
  document.getElementById('checkout-plan-label').textContent = i18n[currentLang][`plan_${plan}`];
  document.getElementById('checkout-sym').textContent = 'EGP';
  document.getElementById('checkout-amount').textContent = EGP.format(amount);
  document.getElementById('checkout-period').textContent = i18n[currentLang].plan_period;
  document.getElementById('checkout-bundle-details').textContent = plan === 'custom'
    ? (selectedNames.length ? selectedNames.join(' · ') : i18n[currentLang].custom_base_only)
    : i18n[currentLang].monthly_service;
  document.getElementById('checkout-overlay').style.display = 'flex';
  document.getElementById('co-email').focus();
}

function closeCheckoutBtn() {
  document.getElementById('checkout-overlay').style.display = 'none';
  document.getElementById('checkout-error').textContent = '';
}

function closeCheckout(event) {
  if (event.target.id === 'checkout-overlay') closeCheckoutBtn();
}

async function submitCheckout() {
  const first = document.getElementById('co-first').value.trim();
  const last = document.getElementById('co-last').value.trim();
  const email = document.getElementById('co-email').value.trim();
  const phone = document.getElementById('co-phone').value.trim();
  const errorEl = document.getElementById('checkout-error');

  if (!first || !last || !email || !phone) {
    errorEl.textContent = 'All fields are required.';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errorEl.textContent = 'Invalid email address.';
    return;
  }
  if (phone.length < 10 || !/^\+?[\d\s\-()]+$/.test(phone)) {
    errorEl.textContent = 'Invalid phone number.';
    return;
  }

  const plan = selectedPlan;
  const addons = plan === 'custom' ? getSelectedAddons() : [];
  errorEl.textContent = '';
  const submitButton = document.querySelector('.checkout-submit');
  submitButton.disabled = true;
  submitButton.textContent = i18n[currentLang].checkout_submitting;

  try {
    const response = await fetch(`${API}/api/payment-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        firstName: first,
        lastName: last,
        phone,
        website: document.getElementById('co-website').value,
        plan,
        addons
      })
    });
    const responseText = await response.text();
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new Error('The request service returned a web page instead of JSON. Deploy the Node backend and set its URL in api-config.js.');
    }
    if (!response.ok || !data.success || !data.reference) {
      throw new Error(data.error || 'Unable to send your request. Please try again.');
    }

    window.location.assign(`success.html?reference=${encodeURIComponent(data.reference)}`);
  } catch (error) {
    console.error('Checkout error:', error);
    errorEl.textContent = error instanceof TypeError && error.message === 'Failed to fetch'
      ? 'The request service is unavailable. Please try again in a moment.'
      : error.message || 'Unable to send your request. Please try again.';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = i18n[currentLang].checkout_submit;
  }
}

// ── i18n ────────────────────────────────────────────────────────
const i18n = {
  en: {
    hero_title: 'Your Personal Brand, Scaled.',
    hero_subtitle: 'High-converting content and personal branding systems for creators, entrepreneurs, and agencies.',
    hero_cta: 'Get Started',
    nav_services: 'Personal Branding',
    nav_plans: 'Plans',
    nav_process: 'Process',
    service_heading: 'What We Do',
    service_desc: 'Build an authentic, scalable personal brand that converts. We handle strategy, content creation, and community growth.',
    service_feature_1: 'Brand strategy & positioning',
    service_feature_2: 'Content calendar & production',
    service_feature_3: 'Community management',
    service_feature_4: 'Analytics & optimization',
    service_feature_5: 'Script writing & concepts',
    service_feature_6: 'Professional filming',
    service_feature_7: 'Editing & post-production',
    service_feature_8: 'A/B testing & revisions',
    showreel_label: 'Showreel',
    showreel_heading: 'See Our Work',
    reel0_desc: 'See how we create high-converting content.',
    plans_heading: 'Simple, Transparent Pricing',
    plans_subtitle: 'The complete client acquisition engine for your business in Egypt.',
    plan_period: '/ month',
    checkout_submit: 'Request Payment Link',
    checkout_submitting: 'Sending request…',
    checkout_note: 'We will email you to confirm your request, then send your payment link. Questions? Call 01000006619.',
    per_month: 'Monthly',
    per_year: 'Yearly',
    plan_starter: 'Starter',
    plan_starter_desc: 'Perfect for local shops, personal brands, and solo creators.',
    plan_starter_f1: '8–10 videos (Scripts & Edits)',
    plan_starter_f2: '6 Social / Ad Graphics',
    plan_starter_f3: 'Free Landing Page Setup',
    plan_starter_f4: 'WhatsApp chat integration',
    plan_growth: 'Growth',
    plan_growth_desc: 'For businesses & clinics scaling their reach and conversion.',
    plan_growth_f1: '12–15 videos (Scripts & Edits)',
    plan_growth_f2: '12 Graphics & Ad Assets',
    plan_growth_f3: 'Multi-Page Website & SEO',
    plan_growth_f4: 'Lead Forms & CRM Integration',
    plan_growth_f5: 'Web Optimization & Monthly Care',
    plan_pro: 'Pro',
    plan_pro_desc: 'Custom platforms, scaling brands, and full monthly agency support.',
    plan_pro_f1: '20+ Premium Videos',
    plan_pro_f2: 'Full Scriptwriting & SFX',
    plan_pro_f3: 'Large Monthly Graphic Suite',
    plan_pro_f4: 'Custom Web/E-Commerce Build',
    plan_pro_f5: 'Payment Gateway Setup',
    plan_pro_f6: 'Dedicated Project Manager',
    plan_custom: 'Custom',
    plan_custom_desc: 'Customize your package based on exact deliverables and scale.',
    plan_custom_select: 'Select deliverables:',
    addon_website: 'Website (+EGP 12k+)',
    addon_scripts_video: 'Script & Video Pack (+EGP 8k+)',
    addon_graphics: 'Graphic Pack (+EGP 4k+)',
    addon_app_mvp: 'App Development MVP (+EGP 60k+)',
    plan_custom_f1: 'Custom mix & match',
    plan_custom_f2: 'Fully tailored workflow',
    plan_badge_seller: 'Best Seller',
    plan_badge_value: 'Best Value',
    plan_cta: 'Choose Plan',
    plan_custom_base: '/ month base',
    monthly_service: 'Monthly marketing service',
    custom_base_only: 'Custom bundle base',
    process_heading: 'How We Work',
    step_1_title: 'Discovery',
    step_1_desc: 'We audit your brand and create a strategy.',
    step_2_title: 'Strategy',
    step_2_desc: 'We develop comprehensive content strategy.',
    step_3_title: 'Production',
    step_3_desc: 'We create high-quality content.',
    step_4_title: 'Optimization',
    step_4_desc: 'We monitor and refine performance.',
    funnel_label: 'Conversion',
    funnel_awareness: 'Awareness',
    funnel_interest: 'Interest',
    funnel_engagement: 'Engagement',
    funnel_conversion: 'Conversion',
    cta_title: 'Ready to scale your brand?',
    cta_button: 'Start Now',
    footer_copy: '© 2026 Yuxoro. All rights reserved.',
  },
  ar: {
    hero_title: 'العلامة الشخصية الخاصة بك، على نطاق واسع.',
    hero_subtitle: 'محتوى عالي التحويل وأنظمة العلامات الشخصية.',
    hero_cta: 'ابدأ الآن',
    nav_services: 'العلامات الشخصية',
    nav_plans: 'الخطط',
    nav_process: 'العملية',
    service_heading: 'ما نفعله',
    service_desc: 'بناء علامة شخصية أصيلة وقابلة للتوسع.',
    service_feature_1: 'استراتيجية العلامة',
    service_feature_2: 'تقويم المحتوى',
    service_feature_3: 'إدارة المجتمع',
    service_feature_4: 'التحليلات',
    service_feature_5: 'كتابة السيناريو',
    service_feature_6: 'التصوير',
    service_feature_7: 'التحرير',
    service_feature_8: 'اختبار A/B',
    showreel_label: 'العرض',
    showreel_heading: 'شاهد عملنا',
    reel0_desc: 'شاهد كيف ننشئ محتوى.',
    plans_heading: 'التسعير البسيط',
    plans_subtitle: 'محرك متكامل لاكتساب العملاء لنشاطك التجاري في مصر.',
    plan_period: '/ شهريًا',
    checkout_submit: 'طلب رابط الدفع',
    checkout_submitting: 'جارٍ إرسال الطلب…',
    checkout_note: 'سنرسل إليك رسالة لتأكيد طلبك، ثم نرسل رابط الدفع. للاستفسار اتصل على 01000006619.',
    per_month: 'شهري',
    per_year: 'سنوي',
    plan_starter: 'البداية',
    plan_starter_desc: 'مثالي للمتاجر المحلية والعلامات الشخصية وصنّاع المحتوى المستقلين.',
    plan_starter_f1: '8–10 فيديوهات (كتابة ومونتاج)',
    plan_starter_f2: '6 تصميمات اجتماعية وإعلانية',
    plan_starter_f3: 'إعداد صفحة هبوط مجانًا',
    plan_starter_f4: 'تكامل دردشة واتساب',
    plan_growth: 'النمو',
    plan_growth_desc: 'للشركات والعيادات التي توسّع نطاق وصولها وتحويلاتها.',
    plan_growth_f1: '12–15 فيديو (كتابة ومونتاج)',
    plan_growth_f2: '12 تصميمًا وأصلًا إعلانيًا',
    plan_growth_f3: 'موقع متعدد الصفحات وتحسين محركات البحث',
    plan_growth_f4: 'نماذج العملاء وتكامل CRM',
    plan_growth_f5: 'تحسين الموقع والعناية الشهرية',
    plan_pro: 'احترافي',
    plan_pro_desc: 'منصات مخصصة وعلامات متنامية ودعم شهري متكامل من الوكالة.',
    plan_pro_f1: 'أكثر من 20 فيديو مميزًا',
    plan_pro_f2: 'كتابة نصوص ومؤثرات صوتية كاملة',
    plan_pro_f3: 'مجموعة تصميمات شهرية كبيرة',
    plan_pro_f4: 'إنشاء مواقع وتجارة إلكترونية مخصصة',
    plan_pro_f5: 'إعداد بوابة الدفع',
    plan_pro_f6: 'مدير مشروع مخصص',
    plan_custom: 'مخصص',
    plan_custom_desc: 'خصص باقتك حسب المخرجات المطلوبة وحجم العمل.',
    plan_custom_select: 'اختر الخدمات:',
    addon_website: 'موقع إلكتروني (+12 ألف جنيه أو أكثر)',
    addon_scripts_video: 'حزمة نصوص وفيديو (+8 آلاف جنيه أو أكثر)',
    addon_graphics: 'حزمة تصميمات (+4 آلاف جنيه أو أكثر)',
    addon_app_mvp: 'تطوير نسخة أولية لتطبيق (+60 ألف جنيه أو أكثر)',
    plan_custom_f1: 'توليفة مخصصة من الخدمات',
    plan_custom_f2: 'سير عمل مصمم بالكامل لك',
    plan_badge_seller: 'الأكثر مبيعاً',
    plan_badge_value: 'أفضل قيمة',
    plan_cta: 'اختر',
    plan_custom_base: '/ شهر كقيمة أساسية',
    monthly_service: 'خدمة تسويق شهرية',
    custom_base_only: 'القيمة الأساسية للباقة المخصصة',
    process_heading: 'كيف نعمل',
    step_1_title: 'الاكتشاف',
    step_1_desc: 'نقوم بتدقيق علامتك.',
    step_2_title: 'الاستراتيجية',
    step_2_desc: 'نطور استراتيجية شاملة.',
    step_3_title: 'الإنتاج',
    step_3_desc: 'نقوم بإنشاء محتوى عالي الجودة.',
    step_4_title: 'التحسين',
    step_4_desc: 'نراقب وننقح الأداء.',
    funnel_label: 'التحويل',
    funnel_awareness: 'الوعي',
    funnel_interest: 'الاهتمام',
    funnel_engagement: 'المشاركة',
    funnel_conversion: 'التحويل',
    cta_title: 'هل أنت مستعد?',
    cta_button: 'ابدأ الآن',
    footer_copy: '© 2026 Yuxoro. جميع الحقوق محفوظة.',
  }
};

function setLang(lang) {
  currentLang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = i18n[lang]?.[key] || key;
  });
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === lang));
}

// ── INITIALIZE ──────────────────────────────────────────────────
window.addEventListener('load', () => {
  setLang('en');
});

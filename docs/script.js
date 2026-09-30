const API = (window.YUXORO_API_URL || window.location.origin).replace(/\/$/, '');
let currentLang = 'en';
let isYearly = false;
let currentCurrency = 'usd';
let lastScrollY = 0;

// ── COUNTRY TO CURRENCY (195+ COUNTRIES) ────────────────────────
const countryToCurrency = {
  US: 'usd', CA: 'usd', MX: 'usd', BR: 'usd', AR: 'usd', CL: 'usd', CO: 'usd', PE: 'usd', VE: 'usd', EC: 'usd',
  GB: 'gbp', IE: 'gbp', DE: 'eur', FR: 'eur', IT: 'eur', ES: 'eur', NL: 'eur', BE: 'eur', AT: 'eur', CH: 'eur',
  SE: 'eur', NO: 'eur', DK: 'eur', FI: 'eur', PL: 'eur', CZ: 'eur', HU: 'eur', RO: 'eur', GR: 'eur', PT: 'eur',
  AE: 'aed', SA: 'sar', EG: 'egp', JO: 'aed', KW: 'aed', QA: 'aed', BH: 'aed', OM: 'aed', YE: 'aed', LB: 'aed',
  JP: 'eur', CN: 'eur', IN: 'eur', ID: 'eur', TH: 'eur', MY: 'eur', SG: 'eur', PH: 'eur', VN: 'eur', KR: 'eur',
  AU: 'gbp', NZ: 'gbp', ZA: 'gbp', NG: 'gbp', KE: 'gbp', GH: 'gbp', PK: 'eur', BD: 'eur', LK: 'eur', NP: 'eur',
  TR: 'eur', IL: 'eur', IR: 'eur', IQ: 'aed', SY: 'aed', PS: 'aed', UA: 'eur', RU: 'eur'
};

const currencies = {
  usd: { symbol: '$', rates: { starter: { m: 50, y: 40 }, growth: { m: 180, y: 144 }, pro: { m: 240, y: 192 } } },
  eur: { symbol: '€', rates: { starter: { m: 46, y: 37 }, growth: { m: 165, y: 132 }, pro: { m: 220, y: 176 } } },
  gbp: { symbol: '£', rates: { starter: { m: 40, y: 32 }, growth: { m: 145, y: 116 }, pro: { m: 195, y: 156 } } },
  aed: { symbol: 'AED', rates: { starter: { m: 184, y: 147 }, growth: { m: 661, y: 529 }, pro: { m: 881, y: 705 } } },
  sar: { symbol: 'SAR', rates: { starter: { m: 188, y: 150 }, growth: { m: 675, y: 540 }, pro: { m: 900, y: 720 } } },
  egp: { symbol: 'EGP', rates: { starter: { m: 1550, y: 1240 }, growth: { m: 5580, y: 4464 }, pro: { m: 7440, y: 5952 } } },
};

// ── VPN DETECTION ──────────────────────────────────────────────
async function detectVPN() {
  try {
    // Try multiple APIs for better detection with Cloudflare
    let data = null;
    let isVPN = false;
    let country = 'EG'; // Default to Egypt
    let org = 'Unknown';

    // Method 1: ipapi.co
    try {
      const res1 = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) });
      data = await res1.json();
      country = data.country_code || 'EG';
      org = data.org || 'Unknown';
      isVPN = org.toLowerCase().includes('vpn') || org.toLowerCase().includes('proxy') || org.toLowerCase().includes('cloudflare') || org.toLowerCase().includes('datacenter');
    } catch (e1) {
      console.warn('Method 1 failed, trying Method 2...');
      
      // Method 2: ip-api.com
      try {
        const res2 = await fetch('https://ip-api.com/json/', { signal: AbortSignal.timeout(3000) });
        data = await res2.json();
        country = data.countryCode || 'EG';
        org = data.isp || 'Unknown';
        isVPN = data.proxy === true || org.toLowerCase().includes('vpn') || org.toLowerCase().includes('proxy');
      } catch (e2) {
        console.warn('Both methods failed, using defaults');
        country = 'EG';
      }
    }

    return { isVPN, country: country || 'EG', org };
  } catch (err) {
    console.warn('VPN detection error:', err);
    return { isVPN: false, country: 'EG', org: 'Unknown' };
  }
}

// ── COUNTRY & CURRENCY DETECTION ────────────────────────────────
async function detectCountryAndCurrency() {
  try {
    const vpnResult = await detectVPN();
    if (vpnResult.isVPN) {
      showVPNWarning(vpnResult);
      return false;
    }
    const currency = countryToCurrency[vpnResult.country] || 'usd';
    currentCurrency = currency;
    updateDisplayedPrices();
    console.log(`✓ Detected: ${vpnResult.country} → ${currency.toUpperCase()}`);
    return true;
  } catch { currentCurrency = 'usd'; updateDisplayedPrices(); return true; }
}

// ── VPN WARNING MODAL ────────────────────────────────────────────
function showVPNWarning(vpnResult) {
  const overlay = document.createElement('div');
  overlay.id = 'vpn-warning-overlay';
  overlay.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.95); backdrop-filter: blur(50px); display: flex; align-items: center; justify-content: center; z-index: 3000; padding: 1rem;`;
  
  const modal = document.createElement('div');
  modal.style.cssText = `background: rgba(10,10,10,0.8); border: 1px solid rgba(255,255,255,0.15); border-radius: 2rem; padding: 2.5rem; max-width: 500px; text-align: center; box-shadow: 0 40px 80px rgba(0,0,0,0.6); backdrop-filter: blur(50px);`;
  
  modal.innerHTML = `
    <h2 style="font-size: 1.5rem; margin-bottom: 1rem; font-weight: 700;">VPN Detected</h2>
    <p style="color: rgba(255,255,255,0.6); margin-bottom: 1.5rem; font-size: 15px;">We detected you're using a VPN or proxy. For the best experience and secure payments, please disable it.</p>
    <p style="color: rgba(255,255,255,0.4); font-size: 0.9rem; margin-bottom: 2rem;">Provider: ${vpnResult.org || 'Unknown'}</p>
    <div style="display: flex; gap: 1rem; flex-direction: column;">
      <button onclick="retryDetection()" style="width: 100%; padding: 1rem; background: #ffffff; color: #000000; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; font-size: 15px;">Retry Detection</button>
      <button onclick="continueWithVPN()" style="width: 100%; padding: 1rem; background: transparent; color: #ffffff; border: 1px solid rgba(255,255,255,0.3); border-radius: 10px; font-weight: 700; cursor: pointer; font-size: 15px;">Continue Anyway</button>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function retryDetection() {
  const overlay = document.getElementById('vpn-warning-overlay');
  if (overlay) overlay.remove();
  detectCountryAndCurrency();
}

function continueWithVPN() {
  const overlay = document.getElementById('vpn-warning-overlay');
  if (overlay) overlay.remove();
  console.warn('⚠️ User continued with VPN');
  const currency = countryToCurrency[navigator.language?.split('-')[1]] || 'usd';
  currentCurrency = currency;
  updateDisplayedPrices();
}

// ── PRICE UPDATES WITH ANIMATION ────────────────────────────
function updateDisplayedPrices() {
  const cur = currencies[currentCurrency];
  if (!cur) return;
  const planPrices = document.querySelectorAll('.plan-price');
  planPrices.forEach(el => {
    const plan = el.dataset.plan;
    const price = isYearly ? el.dataset.yearly : el.dataset.monthly;
    const converted = Math.round(price * (cur.rates[plan]?.m || 1) / 50);
    
    // Animate number
    animateValue(el, parseInt(el.textContent) || 0, converted, 500);
  });
  document.querySelectorAll('.currency-symbol').forEach(s => s.textContent = cur.symbol);
  document.querySelectorAll('.billing-period').forEach(p => p.textContent = isYearly ? '/ year' : '/ month');
}

function animateValue(element, start, end, duration) {
  const range = end - start;
  const increment = range / (duration / 16);
  let current = start;
  
  const animate = () => {
    current += increment;
    if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
      element.textContent = end.toLocaleString();
    } else {
      element.textContent = Math.round(current).toLocaleString();
      requestAnimationFrame(animate);
    }
  };
  
  requestAnimationFrame(animate);
}

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

// ── BILLING TOGGLE ──────────────────────────────────────────────
function toggleBilling() {
  isYearly = !isYearly;
  const knob = document.querySelector('.billing-knob');
  const labels = document.querySelectorAll('.billing-label');
  if (isYearly) {
    knob.style.transform = 'translateX(calc(100% + 4px))';
    labels[0].classList.remove('active');
    labels[1].classList.add('active');
  } else {
    knob.style.transform = 'translateX(0)';
    labels[0].classList.add('active');
    labels[1].classList.remove('active');
  }
  updateDisplayedPrices();
  updateCustomPrice();
}

// ── CUSTOM PLAN ─────────────────────────────────────────────────
function updateCustomPrice() {
  const cur = currencies[currentCurrency];
  const base = 70;
  const checkboxes = document.querySelectorAll('.custom-options input[type="checkbox"]:checked');
  const total = base + checkboxes.length * 20;
  document.getElementById('custom-price').textContent = Math.round(total * (cur.rates.starter.m || 1) / 50).toLocaleString();
}

// ── CHECKOUT ────────────────────────────────────────────────────
function checkout(plan) {
  const cur = currencies[currentCurrency];
  let amount = cur.rates[plan]?.[isYearly ? 'y' : 'm'] || 70;
  document.getElementById('checkout-plan-label').textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
  document.getElementById('checkout-sym').textContent = cur.symbol;
  document.getElementById('checkout-amount').textContent = Math.round(amount).toLocaleString();
  document.getElementById('checkout-period').textContent = isYearly ? '/ year' : '/ month';
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

  const plan = document.getElementById('checkout-plan-label').textContent.toLowerCase();
  const amount = currencies[currentCurrency].rates[plan]?.[isYearly ? 'y' : 'm'] || 70;
  errorEl.textContent = '';

  try {
    const response = await fetch(`${API}/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        firstName: first,
        lastName: last,
        phone,
        plan,
        amount,
        currency: currentCurrency,
        billing: isYearly ? 'yearly' : 'monthly'
      })
    });
    const data = await response.json();
    if (!response.ok || !data.success || !data.iframeUrl) {
      throw new Error(data.error || 'Unable to start checkout. Please try again.');
    }

    sessionStorage.setItem('yuxoro_plan', plan.charAt(0).toUpperCase() + plan.slice(1));
    sessionStorage.setItem('yuxoro_amount', `${currencies[currentCurrency].symbol}${Math.round(amount).toLocaleString()}${isYearly ? '/yr' : '/mo'}`);
    window.location.assign(data.iframeUrl);
  } catch (error) {
    console.error('Checkout error:', error);
    errorEl.textContent = error instanceof TypeError && error.message === 'Failed to fetch'
      ? 'Cannot reach the payment server. Start it with npm start, then open the site at http://localhost:3000.'
      : error.message || 'Unable to start checkout. Please try again.';
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
    plans_subtitle: 'Everything you need to build your personal brand and scale your reach.',
    per_month: 'Monthly',
    per_year: 'Yearly',
    plan_starter: 'Starter',
    plan_starter_desc: 'Perfect for individuals getting started.',
    plan_starter_f1: '5 content pieces/month',
    plan_starter_f2: 'Email support',
    plan_starter_f3: 'Basic analytics',
    plan_growth: 'Growth',
    plan_growth_desc: 'For growing creators and agencies.',
    plan_growth_f1: '10 content pieces/month',
    plan_growth_f2: 'Priority support',
    plan_growth_f3: 'Advanced analytics',
    plan_pro: 'Pro',
    plan_pro_desc: 'Complete agency-level service.',
    plan_pro_f1: 'Unlimited content',
    plan_pro_f2: 'Video production',
    plan_pro_f3: 'Monthly strategy calls',
    plan_custom: 'Custom',
    plan_custom_desc: 'Build your package. $70 base + $20 per deliverable.',
    plan_custom_select: 'Select deliverables:',
    plan_badge_seller: 'Best Seller',
    plan_badge_value: 'Best Value',
    plan_cta: 'Choose Plan',
    plan_custom_base: '+',
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
    plans_subtitle: 'كل ما تحتاجه لبناء علامتك.',
    per_month: 'شهري',
    per_year: 'سنوي',
    plan_starter: 'البداية',
    plan_starter_desc: 'مثالي للأفراد.',
    plan_starter_f1: '5 قطع محتوى/شهر',
    plan_starter_f2: 'دعم عبر البريد',
    plan_starter_f3: 'تحليلات أساسية',
    plan_growth: 'النمو',
    plan_growth_desc: 'للمنشئين المتنامين.',
    plan_growth_f1: '10 قطع محتوى/شهر',
    plan_growth_f2: 'دعم أولوية',
    plan_growth_f3: 'تحليلات متقدمة',
    plan_pro: 'احترافي',
    plan_pro_desc: 'خدمة على مستوى الوكالة.',
    plan_pro_f1: 'محتوى غير محدود',
    plan_pro_f2: 'إنتاج الفيديو',
    plan_pro_f3: 'استدعاءات استراتيجية',
    plan_custom: 'مخصص',
    plan_custom_desc: 'بناء الحزمة. $70 + $20.',
    plan_custom_select: 'اختر الملفات:',
    plan_badge_seller: 'الأكثر مبيعاً',
    plan_badge_value: 'أفضل قيمة',
    plan_cta: 'اختر',
    plan_custom_base: '+',
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
  detectCountryAndCurrency();
});

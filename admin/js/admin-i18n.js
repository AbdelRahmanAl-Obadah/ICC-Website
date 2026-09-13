/**
 * Admin Panel bilingual layer (EN/AR + RTL/LTR).
 * Works by walking text nodes + known attributes and swapping in Arabic
 * strings from the dictionary below, without touching markup/JS logic.
 * Runs on load, on language toggle, and on every DOM mutation so it also
 * covers content rendered dynamically by admin-crud.js / admin-users.js / etc.
 */
export const AR = {
  // Sidebar / nav
  'ICC Admin': 'لوحة تحكم ICC',
  'Dashboard': 'الرئيسية',
  'Majors': 'التخصصات',
  'Semesters': 'الفصول الدراسية',
  'Subjects': 'المواد',
  'Requirements': 'المتطلبات',
  'Website content': 'محتوى الموقع',
  'Settings': 'الإعدادات',
  'Team & access': 'الفريق والصلاحيات',
  'Logout': 'تسجيل الخروج',
  'Menu': 'القائمة',
  'Administrator': 'مسؤول',
  'Checking access…': 'جاري التحقق من الصلاحية…',
  'العربية': 'English',

  // Dashboard
  'Quick actions': 'إجراءات سريعة',
  'Add Major': 'إضافة تخصص',
  'Add Semester': 'إضافة فصل دراسي',
  'Add Subject': 'إضافة مادة',
  'Add Requirement': 'إضافة متطلب',
  'Create User': 'إنشاء مستخدم',

  // Generic list / form chrome
  'Add major': 'إضافة تخصص',
  'Search majors by name or code': 'ابحث عن تخصص بالاسم أو الرمز',
  'Major': 'التخصص', 'Code': 'الرمز', 'College': 'الكلية', 'Status': 'الحالة',
  'Order': 'الترتيب', 'Actions': 'إجراءات', 'Close': 'إغلاق',
  'Edit': 'تعديل', 'Duplicate': 'نسخ', 'Delete': 'حذف', 'Save': 'حفظ', 'Cancel': 'إلغاء',
  'Active': 'مفعّل', 'Inactive': 'غير مفعّل',
  'Deleted successfully.': 'تم الحذف بنجاح.',
  'Saved successfully.': 'تم الحفظ بنجاح.',
  'Could not save.': 'تعذّر الحفظ.',
  'Course URL must be valid.': 'رابط المادة غير صالح.',
  'This major has associated semesters or subjects. Remove them first.': 'يحتوي هذا التخصص على فصول أو مواد مرتبطة. يجب حذفها أولاً.',

  // Field labels (admin-crud.js)
  'English name': 'الاسم بالإنجليزية', 'Arabic name': 'الاسم بالعربية',
  'College (English)': 'الكلية (إنجليزي)', 'College (Arabic)': 'الكلية (عربي)',
  'Description (English)': 'الوصف (إنجليزي)', 'Description (Arabic)': 'الوصف (عربي)',
  'Slug': 'المعرّف النصي', 'Curriculum image URL': 'رابط صورة الخطة الدراسية',
  'Year number': 'رقم السنة', 'Semester number': 'رقم الفصل',
  'Credit hours': 'الساعات المعتمدة',
  'Prerequisite (English)': 'المتطلب السابق (إنجليزي)', 'Prerequisite (Arabic)': 'المتطلب السابق (عربي)',
  'Course URL': 'رابط المادة', 'Semester': 'الفصل الدراسي',
  'Requirement type': 'نوع المتطلب', 'Category': 'الفئة', 'Display order': 'ترتيب العرض',
  'Global / none': 'عام / بدون', 'None': 'بدون',
  'Free Elective': 'متطلب اختياري حر', 'University Requirement': 'متطلب جامعة', 'College Requirement': 'متطلب كلية',
  'Add ': 'إضافة ', 'Edit ': 'تعديل ',
  'Are you sure you want to delete this': 'هل أنت متأكد من حذف هذا العنصر:',

  // Majors/Semesters/Subjects/Requirements pages
  'No majors yet.': 'لا يوجد تخصصات بعد.', 'No semesters yet.': 'لا يوجد فصول دراسية بعد.',
  'No subjects yet.': 'لا يوجد مواد بعد.', 'No requirements yet.': 'لا يوجد متطلبات بعد.',

  // Website content page
  'Edit the bilingual copy displayed on the public homepage.': 'عدّل النصوص الظاهرة على الصفحة الرئيسية للموقع (عربي وإنجليزي).',
  'Preview website': 'معاينة الموقع',
  'Homepage hero': 'رأس الصفحة الرئيسية',
  'The main message at the top of the homepage.': 'الرسالة الرئيسية أعلى الصفحة الرئيسية.',
  'Hero title — English': 'العنوان الرئيسي — إنجليزي', 'Hero title — Arabic': 'العنوان الرئيسي — عربي',
  'Hero description — English': 'الوصف الرئيسي — إنجليزي', 'Hero description — Arabic': 'الوصف الرئيسي — عربي',
  'About ICC': 'عن النادي',
  'The introduction below featured majors.': 'المقدمة الظاهرة أسفل التخصصات المميزة.',
  'Section title — English': 'عنوان القسم — إنجليزي', 'Section title — Arabic': 'عنوان القسم — عربي',
  'Description — English': 'الوصف — إنجليزي', 'Description — Arabic': 'الوصف — عربي',
  'Footer': 'التذييل',
  'The short platform description in the public footer.': 'الوصف المختصر الظاهر في تذييل الموقع.',
  'Footer text — English': 'نص التذييل — إنجليزي', 'Footer text — Arabic': 'نص التذييل — عربي',
  'All changes are public after saving.': 'تصبح كل التعديلات ظاهرة للجميع فور الحفظ.',
  'Save website content': 'حفظ محتوى الموقع',
  'Saving…': 'جاري الحفظ…',
  'Website content saved successfully. Refresh the public-site preview to see the changes.': 'تم حفظ محتوى الموقع بنجاح. حدّث معاينة الموقع لرؤية التغييرات.',
  'Could not save website content.': 'تعذّر حفظ محتوى الموقع.',
  'Website content could not be loaded.': 'تعذّر تحميل محتوى الموقع.',

  // Settings page
  'Site settings': 'إعدادات الموقع',
  'General configuration for the public website.': 'الإعدادات العامة للموقع العام.',
  'Site name': 'اسم الموقع', 'Organization name': 'اسم الجهة',
  'Default language': 'اللغة الافتراضية', 'English': 'الإنجليزية', 'Arabic': 'العربية',
  'Facebook URL': 'رابط فيسبوك',
  'Enable maintenance mode': 'تفعيل وضع الصيانة',
  'Changes apply to the public website immediately.': 'تُطبَّق التغييرات على الموقع العام فوراً.',
  'Save settings': 'حفظ الإعدادات',
  'Settings saved successfully.': 'تم حفظ الإعدادات بنجاح.',
  'Could not save settings.': 'تعذّر حفظ الإعدادات.',
  'Settings could not be loaded.': 'تعذّر تحميل الإعدادات.',

  // Users / Team & access page
  'Control who can access the administration workspace and what they may manage.': 'تحكّم بمن يمكنه الدخول إلى لوحة التحكم وما الذي يمكنه إدارته.',
  'User access': 'صلاحية مستخدم',
  'How to add a user:': 'كيفية إضافة مستخدم:',
  'first create their account in Firebase Authentication, then paste its UID here. This safely connects that existing account to ICC permissions.': 'أنشئ حسابه أولاً في Firebase Authentication، ثم الصق معرّف المستخدم (UID) هنا. هذا يربط الحساب بصلاحيات ICC بأمان.',
  'User': 'المستخدم', 'Role': 'الدور', 'Permissions': 'الصلاحيات',
  'Only a Super administrator can manage team access.': 'فقط المسؤول العام (Super admin) يمكنه إدارة صلاحيات الفريق.',
  'No user access profiles yet.': 'لا يوجد مستخدمون بعد.',
  'Unnamed user': 'مستخدم بدون اسم',
  'Super admin': 'مسؤول عام', 'Full access': 'صلاحية كاملة',
  'Firebase Authentication UID *': 'معرّف Firebase Authentication (UID) *',
  'Paste the user UID from Firebase Authentication': 'الصق معرّف المستخدم من Firebase Authentication',
  'Display name *': 'الاسم الظاهر *', 'Email *': 'البريد الإلكتروني *',
  'Account status': 'حالة الحساب',
  'What can this user manage?': 'ما الذي يمكن لهذا المستخدم إدارته؟',
  'Majors, semesters, subjects & requirements': 'التخصصات، الفصول، المواد والمتطلبات',
  'Site settings ': 'إعدادات الموقع',
  'Save access': 'حفظ الصلاحية',
  'User access saved.': 'تم حفظ صلاحية المستخدم.',
  'Access removed.': 'تمت إزالة الصلاحية.',
  'Could not save user access.': 'تعذّر حفظ صلاحية المستخدم.',
  'Remove': 'إزالة',

  // Login page
  'ICC Admin sign in': 'تسجيل الدخول - لوحة تحكم ICC',
  'Admin Panel': 'لوحة التحكم',
  'Sign in with an authorized administrator account.': 'سجّل الدخول بحساب مسؤول مصرّح له.',
  'Email': 'البريد الإلكتروني', 'Password': 'كلمة المرور',
  'Sign in': 'تسجيل الدخول', 'Signing in…': 'جاري تسجيل الدخول…',
  'or': 'أو',
  'Sign in with Google': 'تسجيل الدخول عبر جوجل',
  'Forgot password?': 'نسيت كلمة المرور؟',
  'Enter your email address first.': 'أدخل بريدك الإلكتروني أولاً.',
  'Password reset email sent.': 'تم إرسال رسالة إعادة تعيين كلمة المرور.',
  'Unable to send reset email.': 'تعذّر إرسال رسالة إعادة التعيين.',
  'Unable to sign in.': 'تعذّر تسجيل الدخول.',
  'Google sign-in was cancelled.': 'تم إلغاء تسجيل الدخول عبر جوجل.',
  'You are not authorized to access the Admin Panel.': 'لا تملك صلاحية الدخول إلى لوحة التحكم.',
};

const LANG_KEY = 'icc-lang';
export const getLang = () => localStorage.getItem(LANG_KEY) || 'en';
export const setLang = lang => localStorage.setItem(LANG_KEY, lang);

const ORIGINAL_TEXT = new WeakMap();
const ORIGINAL_ATTR = new WeakMap();
const ATTRS = ['placeholder', 'aria-label', 'title'];

function translateTextNode(node) {
  if (!ORIGINAL_TEXT.has(node)) ORIGINAL_TEXT.set(node, node.nodeValue);
  const original = ORIGINAL_TEXT.get(node);
  const trimmed = original.trim();
  if (!trimmed) return;
  const lang = getLang();
  if (lang === 'ar') {
    const ar = AR[trimmed];
    if (ar) node.nodeValue = original.replace(trimmed, ar);
    else node.nodeValue = original;
  } else {
    node.nodeValue = original;
  }
}

function translateAttrs(el) {
  ATTRS.forEach(attr => {
    if (!el.hasAttribute?.(attr)) return;
    const map = ORIGINAL_ATTR.get(el) || {};
    if (!(attr in map)) map[attr] = el.getAttribute(attr);
    ORIGINAL_ATTR.set(el, map);
    const original = map[attr];
    const lang = getLang();
    const ar = AR[original];
    el.setAttribute(attr, lang === 'ar' && ar ? ar : original);
  });
}

function walk(root) {
  if (root.nodeType === 3) { translateTextNode(root); return; }
  if (root.nodeType !== 1) return;
  if (['SCRIPT', 'STYLE'].includes(root.tagName)) return;
  translateAttrs(root);
  root.childNodes.forEach(walk);
}

export function applyLang(lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  walk(document.body);
  document.querySelectorAll('[data-lang-admin]').forEach(btn => {
    btn.textContent = lang === 'ar' ? 'English' : 'العربية';
  });
}

export function initAdminI18n() {
  const lang = getLang();
  applyLang(lang);
  document.querySelectorAll('[data-lang-admin]').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = getLang() === 'ar' ? 'en' : 'ar';
      setLang(next);
      applyLang(next);
    });
  });
  // Re-translate anything admin-crud.js / admin-users.js render after us.
  const observer = new MutationObserver(() => applyLang(getLang()));
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

document.addEventListener('DOMContentLoaded', initAdminI18n);

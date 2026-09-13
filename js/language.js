/**
 * language.js
 * -----------------------------------------------------------------------
 * Minimal, dependency-free i18n layer for the ICC site.
 *
 * How it works:
 *  - `translations` holds every UI string keyed by a short id, per language.
 *  - Any element that should be translated gets `data-i18n="key"` for text
 *    content, or `data-i18n-attr="attr:key"` to translate an attribute
 *    (e.g. placeholder, aria-label).
 *  - The chosen language is persisted in localStorage under `icc-lang` so
 *    it survives page navigation and reloads.
 *  - Switching language updates <html lang> and <html dir> so RTL/LTR and
 *    assistive tech both stay correct.
 *
 * This module intentionally has zero external dependencies so it can run
 * before Firebase (or anything else) loads.
 * ------------------------------------------------------------------------
 */

const translations = {
  en: {
    // Nav
    nav_home: "Home",
    nav_requirements: "Academic Requirements",
    nav_majors: "Majors",
    nav_search: "Search",
    nav_brand: "Innovation & Computing Club",

    // Shared data states (used by JS-rendered dynamic sections)
    common_loading: "Loading…",
    common_empty: "No data available.",
    common_error: "Something went wrong. Please try again.",

    // Home — hero
    hero_eyebrow: "Jordan University of Science and Technology · Student Organization",
    hero_title_line1: "Innovation & Computing Club",
    hero_title_line2: "Academic resources, organized like a real curriculum.",
    hero_desc: "ICC brings every requirement, major and subject JUST computing students need into one clear, searchable place — built by students, for students.",
    hero_cta_majors: "Browse majors",
    hero_cta_requirements: "View requirements",
    hero_panel_majors: "Majors mapped",
    hero_panel_requirements: "Requirement tracks",
    hero_panel_langs: "Languages supported",

    // Quick access
    quick_title: "Start here",
    quick_electives: "Free Electives",
    quick_electives_desc: "Courses outside your major, open to everyone.",
    quick_university: "University Requirements",
    quick_university_desc: "Shared across every JUST programme.",
    quick_college: "College Requirements",
    quick_college_desc: "Set by your college, before your major begins.",
    quick_majorsc: "Majors",
    quick_majorsc_desc: "Full curriculum trees, semester by semester.",

    // Featured majors
    featured_title: "Featured majors",
    featured_lede: "A first look at how major pages will read once Firestore data is connected.",
    featured_index: "03",
    demo_label: "Demo entry — not official academic data",
    view_major: "View major",

    // Search
    search_title: "Search the platform",
    search_lede: "Global search across majors, requirements and subjects arrives with Firestore in a later phase. This is the interface.",
    search_placeholder: "Try “Data Structures” or “Cyber Security”",
    filter_all: "All",
    filter_majors: "Majors",
    filter_subjects: "Subjects",
    filter_requirements: "Requirements",
    search_index: "04",

    // About
    about_title: "About ICC",
    about_index: "05",
    about_lede: "Innovation & Computing Club is a student-run organization at Jordan University of Science and Technology, focused on making academic life easier through technology.",
    about_body: "We build the tools we wish existed as students — clear curriculum maps, organized requirements and a searchable home for everything computing students need to plan their degree. This platform is the club's flagship project, developed in phases and maintained by student contributors.",
    about_stat_members: "Active members",
    about_stat_majors: "Majors in progress",
    about_stat_founded: "Founded",
    about_stat_phase: "Current phase",

    // Footer
    footer_desc: "A student-built academic resources platform for JUST's computing community.",
    footer_nav: "Navigate",
    footer_lang: "Language",
    footer_copyright: "© 2026 Innovation & Computing Club, Jordan University of Science and Technology. Built by students.",

    // Requirements page
    req_page_eyebrow: "Academic Requirements",
    req_page_title: "Requirements, organized by where they come from.",
    req_page_desc: "Every JUST computing student moves through the same three layers of requirements before specializing. Placeholder entries below stand in for the real curriculum, which will be managed through the Admin Panel in a later phase.",
    req_electives_title: "Free Electives",
    req_electives_desc: "Open courses from any department, used to round out your degree.",
    req_university_title: "University Requirements",
    req_university_desc: "Shared foundation courses required across all JUST programmes.",
    req_college_title: "College Requirements",
    req_college_desc: "Requirements set by your college ahead of your major coursework.",
    credit_hours: "credit hours",

    // Majors page
    majors_page_eyebrow: "Programmes",
    majors_page_title: "Every major, one reusable template.",
    majors_page_desc: "Each card below opens the same major.html template with a different id — no major gets its own hand-built page. Content shown is placeholder demo data.",

    // Major template
    major_crumb_home: "Home",
    major_crumb_majors: "Majors",
    major_curriculum_title: "Curriculum tree",
    major_curriculum_hint: "Click to enlarge",
    major_curriculum_note: "Placeholder image — real curriculum trees load from Google Drive in a later phase.",
    major_years_title: "Semester plan",
    year_label: "Year",
    semester_label: "Semester",
    prereq_label: "Prerequisite",
    course_link: "Course outline",

    // States
    state_loading: "Loading content…",
    state_empty_title: "Nothing here yet",
    state_empty_body: "This section will populate once Firestore data is connected in a later phase.",
    state_error_title: "Something went wrong",
    state_error_body: "We couldn't load this content. Please try again shortly.",

    // Misc
    demo_notice: "Demo data — for layout purposes only. Not an official JUST curriculum.",

    // Nav — new pages
    nav_gpa: "GPA Calculator",
    nav_admins: "ICC Admins",
    nav_admin_panel: "Admin Panel",

    // GPA calculator
    gpa_eyebrow: "Student tool",
    gpa_title: "GPA Calculator — 4.2 scale",
    gpa_desc: "Add your courses and grades to estimate your semester GPA, and optionally roll it into your cumulative GPA. This tool is unofficial — always confirm your real GPA with the registrar.",
    gpa_courses_title: "This semester's courses",
    gpa_scale_tag: "Scale: out of 4.2",
    gpa_col_course: "Course",
    gpa_col_hours: "Credit hours",
    gpa_col_grade: "Grade",
    gpa_add_course: "+ Add course",
    gpa_include_previous: "Include my previous GPA in the calculation",
    gpa_previous_gpa: "Previous cumulative GPA",
    gpa_previous_hours: "Previous completed hours",
    gpa_result_label: "Your GPA",
    gpa_total_hours: "total credit hours",
    gpa_scale_title: "Grading scale",
    gpa_repeated_course: "Repeated course (retaking it)",
    gpa_repeated_old_grade: "Previous grade in this course",

    // Admins page
    admins_eyebrow: "Behind the platform",
    admins_title: "ICC Admins",
    admins_desc: "The students who keep ICC's academic data accurate and the platform running. Full admin sign-in and content management arrive in Phase 3 — this page is a public directory only.",
    admin_role_lead: "Platform Lead",
    admin_role_lead_desc: "Oversees content accuracy across majors, semesters and requirements.",
    admin_role_dev: "Lead Developer",
    admin_role_dev_desc: "Builds and maintains the Firestore architecture and public website.",
    admin_role_academic: "Academic Data Admin",
    admin_role_academic_desc: "Verifies subjects, prerequisites and credit hours with faculty.",
    admin_role_design: "Design & UX Admin",
    admin_role_design_desc: "Keeps the interface consistent, accessible and bilingual.",
    admins_join_title: "Want to help maintain ICC?",
    admins_join_desc: "Admin accounts, roles and permissions will be managed through Firebase Authentication starting in Phase 3. Reach out to the club to get involved.",
  },

  ar: {
    nav_home: "الرئيسية",
    nav_requirements: "المتطلبات الأكاديمية",
    nav_majors: "التخصصات",

    // Shared data states (used by JS-rendered dynamic sections)
    common_loading: "جاري التحميل...",
    common_empty: "لا توجد بيانات حالياً.",
    common_error: "حدث خطأ. حاول مرة أخرى.",
    nav_search: "بحث",
    nav_brand: "نادي الابتكار والحوسبة",

    hero_eyebrow: "جامعة العلوم والتكنولوجيا الأردنية · منظمة طلابية",
    hero_title_line1: "نادي الابتكار والحوسبة",
    hero_title_line2: "موارد أكاديمية منظمة كخطة دراسية حقيقية.",
    hero_desc: "يجمع نادي ICC كل متطلب وتخصص ومادة يحتاجها طلاب الحوسبة في جامعة العلوم والتكنولوجيا الأردنية في مكان واحد واضح وقابل للبحث، بُني بواسطة طلاب لطلاب.",
    hero_cta_majors: "تصفح التخصصات",
    hero_cta_requirements: "عرض المتطلبات",
    hero_panel_majors: "تخصص موثّق",
    hero_panel_requirements: "مسارات متطلبات",
    hero_panel_langs: "لغات مدعومة",

    quick_title: "ابدأ من هنا",
    quick_electives: "المواد الاختيارية الحرة",
    quick_electives_desc: "مواد خارج تخصصك، متاحة للجميع.",
    quick_university: "متطلبات الجامعة",
    quick_university_desc: "مشتركة بين جميع برامج الجامعة.",
    quick_college: "متطلبات الكلية",
    quick_college_desc: "تحددها كليتك قبل بدء مواد التخصص.",
    quick_majorsc: "التخصصات",
    quick_majorsc_desc: "خطط دراسية كاملة، فصلاً بعد فصل.",

    featured_title: "تخصصات مميزة",
    featured_lede: "لمحة عن شكل صفحات التخصصات بعد ربطها بقاعدة بيانات Firestore.",
    featured_index: "٠٣",
    demo_label: "بيانات تجريبية — ليست بيانات أكاديمية رسمية",
    view_major: "عرض التخصص",

    search_title: "ابحث في المنصة",
    search_lede: "البحث الشامل عبر التخصصات والمتطلبات والمواد سيُفعّل مع Firestore في مرحلة لاحقة. هذه هي الواجهة فقط.",
    search_placeholder: "جرّب «بنية البيانات» أو «الأمن السيبراني»",
    filter_all: "الكل",
    filter_majors: "التخصصات",
    filter_subjects: "المواد",
    filter_requirements: "المتطلبات",
    search_index: "٠٤",

    about_title: "عن ICC",
    about_index: "٠٥",
    about_lede: "نادي الابتكار والحوسبة منظمة طلابية في جامعة العلوم والتكنولوجيا الأردنية، تهدف لتسهيل الحياة الأكاديمية عبر التقنية.",
    about_body: "نبني الأدوات التي تمنينا وجودها كطلاب: خرائط مناهج واضحة، متطلبات منظمة، ومكان واحد قابل للبحث لكل ما يحتاجه طالب الحوسبة لتخطيط تخصصه. هذه المنصة هي المشروع الرئيسي للنادي، تُطوَّر على مراحل ويديرها طلاب مساهمون.",
    about_stat_members: "أعضاء نشطون",
    about_stat_majors: "تخصصات قيد الإعداد",
    about_stat_founded: "تأسس",
    about_stat_phase: "المرحلة الحالية",

    footer_desc: "منصة موارد أكاديمية بناها الطلاب لمجتمع الحوسبة في جامعة العلوم والتكنولوجيا الأردنية.",
    footer_nav: "روابط",
    footer_lang: "اللغة",
    footer_copyright: "© 2026 نادي الابتكار والحوسبة، جامعة العلوم والتكنولوجيا الأردنية. بُني بواسطة الطلاب.",

    req_page_eyebrow: "المتطلبات الأكاديمية",
    req_page_title: "المتطلبات، مرتبة حسب مصدرها.",
    req_page_desc: "يمر كل طالب حوسبة في جامعة العلوم والتكنولوجيا الأردنية بنفس الطبقات الثلاث من المتطلبات قبل التخصص. المدخلات أدناه تجريبية وستُدار لاحقاً عبر لوحة التحكم.",
    req_electives_title: "المواد الاختيارية الحرة",
    req_electives_desc: "مواد مفتوحة من أي قسم، تُستخدم لإكمال ساعات التخرج.",
    req_university_title: "متطلبات الجامعة",
    req_university_desc: "مواد أساسية مشتركة بين جميع برامج الجامعة.",
    req_college_title: "متطلبات الكلية",
    req_college_desc: "متطلبات تحددها كليتك قبل بدء مواد التخصص.",
    credit_hours: "ساعة معتمدة",

    majors_page_eyebrow: "البرامج",
    majors_page_title: "كل تخصص، بقالب واحد قابل لإعادة الاستخدام.",
    majors_page_desc: "كل بطاقة أدناه تفتح نفس قالب major.html بمعرّف مختلف — لا يحصل أي تخصص على صفحة مخصصة. المحتوى المعروض تجريبي.",

    major_crumb_home: "الرئيسية",
    major_crumb_majors: "التخصصات",
    major_curriculum_title: "شجرة المنهاج",
    major_curriculum_hint: "اضغط للتكبير",
    major_curriculum_note: "صورة تجريبية — ستُحمَّل أشجار المناهج الحقيقية من Google Drive في مرحلة لاحقة.",
    major_years_title: "الخطة الدراسية",
    year_label: "السنة",
    semester_label: "الفصل",
    prereq_label: "المتطلب السابق",
    course_link: "مخطط المادة",

    state_loading: "جارٍ تحميل المحتوى…",
    state_empty_title: "لا يوجد محتوى بعد",
    state_empty_body: "سيتم تعبئة هذا القسم عند ربطه بـ Firestore في مرحلة لاحقة.",
    state_error_title: "حدث خطأ ما",
    state_error_body: "تعذّر تحميل هذا المحتوى. الرجاء المحاولة مرة أخرى بعد قليل.",

    demo_notice: "بيانات تجريبية — لأغراض العرض فقط. ليست خطة دراسية رسمية.",

    // Nav — new pages
    nav_gpa: "حاسبة المعدل",
    nav_admins: "مشرفو ICC",
    nav_admin_panel: "لوحة الإدارة",

    // GPA calculator
    gpa_eyebrow: "أداة للطلاب",
    gpa_title: "حاسبة المعدل التراكمي — من 4.2",
    gpa_desc: "أضف موادك وعلاماتك لحساب معدل الفصل، ويمكنك دمجه مع معدلك التراكمي السابق. هذه الأداة غير رسمية — تأكد دائمًا من معدلك الحقيقي لدى دائرة القبول والتسجيل.",
    gpa_courses_title: "مواد هذا الفصل",
    gpa_scale_tag: "المقياس: من 4.2",
    gpa_col_course: "المادة",
    gpa_col_hours: "الساعات المعتمدة",
    gpa_col_grade: "العلامة",
    gpa_add_course: "+ إضافة مادة",
    gpa_include_previous: "أضف معدلي التراكمي السابق إلى الحساب",
    gpa_previous_gpa: "المعدل التراكمي السابق",
    gpa_previous_hours: "الساعات المنجزة سابقًا",
    gpa_result_label: "معدلك",
    gpa_total_hours: "إجمالي الساعات المعتمدة",
    gpa_scale_title: "سلّم العلامات",
    gpa_repeated_course: "مادة معادة (تعيدها)",
    gpa_repeated_old_grade: "علامتك السابقة بهذه المادة",

    // Admins page
    admins_eyebrow: "خلف الكواليس",
    admins_title: "مشرفو ICC",
    admins_desc: "الطلاب الذين يحافظون على دقة البيانات الأكاديمية ويشغّلون المنصة. سيتم إضافة تسجيل الدخول الكامل للمشرفين وإدارة المحتوى في المرحلة الثالثة — هذه الصفحة دليل عام فقط.",
    admin_role_lead: "مسؤول المنصة",
    admin_role_lead_desc: "يشرف على دقة المحتوى عبر التخصصات والفصول والمتطلبات.",
    admin_role_dev: "المطوّر الرئيسي",
    admin_role_dev_desc: "يبني ويصون بنية Firestore والموقع العام.",
    admin_role_academic: "مسؤول البيانات الأكاديمية",
    admin_role_academic_desc: "يتحقق من المواد والمتطلبات السابقة والساعات المعتمدة مع أعضاء هيئة التدريس.",
    admin_role_design: "مسؤول التصميم وتجربة المستخدم",
    admin_role_design_desc: "يحافظ على تناسق الواجهة وسهولة الوصول ودعم اللغتين.",
    admins_join_title: "تريد المساعدة في صيانة ICC؟",
    admins_join_desc: "سيتم إدارة حسابات المشرفين والأدوار والصلاحيات عبر Firebase Authentication ابتداءً من المرحلة الثالثة. تواصل مع النادي للانضمام.",
  },
};

const LANG_STORAGE_KEY = "icc-lang";
const DEFAULT_LANG = "en";

function getStoredLang() {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY) || DEFAULT_LANG;
  } catch (err) {
    return DEFAULT_LANG;
  }
}

function setStoredLang(lang) {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch (err) {
    /* localStorage unavailable (e.g. private mode) — fail silently */
  }
}

/** Translate a single key for the given language, falling back to English. */
function t(key, lang) {
  const dict = translations[lang] || translations[DEFAULT_LANG];
  return dict[key] ?? translations[DEFAULT_LANG][key] ?? key;
}

/** Apply a language across the whole document: text, attrs, dir, lang. */
function applyLanguage(lang) {
  if (!translations[lang]) lang = DEFAULT_LANG;

  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"), lang);
  });

  document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    // format: "attr1:key1,attr2:key2"
    el.getAttribute("data-i18n-attr")
      .split(",")
      .forEach((pair) => {
        const [attr, key] = pair.split(":").map((s) => s.trim());
        if (attr && key) el.setAttribute(attr, t(key, lang));
      });
  });

  document.querySelectorAll("[data-lang-btn]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-lang-btn") === lang);
    btn.setAttribute("aria-pressed", String(btn.getAttribute("data-lang-btn") === lang));
  });

  document.dispatchEvent(new CustomEvent("icc:languagechange", { detail: { lang } }));
}

function initLanguage() {
  const lang = getStoredLang();
  applyLanguage(lang);

  document.querySelectorAll("[data-lang-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const newLang = btn.getAttribute("data-lang-btn");
      setStoredLang(newLang);
      applyLanguage(newLang);
    });
  });
}

document.addEventListener("DOMContentLoaded", initLanguage);

// Exposed for other modules (majors.js, subjects.js) that render text
// dynamically after Firestore data loads.
window.ICC_I18N = { t, getStoredLang, translations };
